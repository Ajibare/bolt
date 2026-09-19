import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { add, mul, sub, toDecimal, type Money } from '@trading-bolt/shared';
import {
  type BrokerOrderRequest,
  type BrokerOrder,
  type MonetaryOracle,
} from '@trading-bolt/broker-adapters';
import {
  DEFAULT_RISK_CONFIG,
  evaluateOrder,
  type OrderProposal,
  type RiskAccountState,
  type RiskConfig,
} from '@trading-bolt/risk-engine';
import { MarketsService } from '../markets/markets.service.js';
import { CreatePaperAccountDto } from './dto/create-paper-account.dto.js';
import { PlacePaperOrderDto } from './dto/place-paper-order.dto.js';
import {
  PaperAccountEntity,
  PaperOrderEntity,
  PaperPortfolioSnapshotEntity,
  PaperPositionEntity,
  type PaperOrderStatus,
} from './entities/paper-trading.entity.js';
import { hydratePaperBroker } from './paper-broker.hydrator.js';
import {
  PaperAccountRepository,
  PaperOrderRepository,
  PaperPortfolioRepository,
  PaperPositionRepository,
} from './paper-trading.repository.js';

/**
 * Paper trading ledger orchestration (AGENTS.md §11/§13/§16/§18).
 *
 * Flow per order:
 *   DTO -> risk evaluateOrder -> PaperBroker -> persisted ledger (orders,
 *   account, position, portfolio snapshot).
 *
 * The broker is ephemeral per request and rehydrated from Postgres, so the
 * database remains the source of truth for balances, positions and P&L.
 */
@Injectable()
export class PaperTradingService {
  constructor(
    private readonly accounts: PaperAccountRepository,
    private readonly orders: PaperOrderRepository,
    private readonly positions: PaperPositionRepository,
    private readonly portfolios: PaperPortfolioRepository,
    private readonly marketsService: MarketsService,
  ) {}

  createAccount(
    userId: string,
    dto: CreatePaperAccountDto,
  ): Promise<PaperAccountEntity> {
    const account = new PaperAccountEntity();
    account.userId = userId;
    account.name = dto.name;
    account.status = 'ACTIVE';
    account.startingCash = dto.startingCash;
    account.freeCash = dto.startingCash;
    account.realizedPnl = '0';
    account.totalFeesPaid = '0';
    return this.accounts.save(account);
  }

  listAccounts(userId: string): Promise<PaperAccountEntity[]> {
    return this.accounts.listByUserId(userId);
  }

  /**
   * Risk-gated order placement. Returns the persisted order — either a fresh
   * execution or, when the same `clientOrderId` was already seen, the original
   * order (idempotency, AGENTS.md §16).
   *
   * `riskConfig` is an optional server-side policy override (AGENTS.md §18):
   * only trusted callers such as the bot runner supply it; it is never derived
   * from frontend input. Defaults to `DEFAULT_RISK_CONFIG` when omitted.
   *
   * `botContext` is an optional server-side attribution override (Phase 10
   * per-bot analytics): the bot runner supplies which bot+run produced the
   * order so the ledger records it. It is never accepted from frontend input.
   */
  async placeOrder(
    userId: string,
    accountId: string,
    dto: PlacePaperOrderDto,
    riskConfig?: Partial<RiskConfig> | null,
    botContext?: { botId: string; botRunId: string } | null,
  ): Promise<PaperOrderEntity> {
    const account = await this.ownedAccount(userId, accountId);
    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Paper account is not active');
    }

    const clientOrderId = dto.clientOrderId ?? randomUUID();
    const existing = await this.orders.findByAccountAndClientOrderId(
      accountId,
      clientOrderId,
    );
    if (existing) {
      return existing;
    }

    const positions = await this.positions.listByAccount(accountId);
    const broker = hydratePaperBroker(account, positions);
    const oracle = await this.oracleFor(dto.symbol);
    if (!oracle) {
      throw new BadRequestException(
        `No market price available for ${dto.symbol}`,
      );
    }

    const proposal: OrderProposal = {
      symbol: dto.symbol,
      side: dto.side,
      quantity: dto.quantity,
      price: oracle.price,
      stopLoss: dto.stopLoss,
      takeProfit: dto.takeProfit,
      reduceOnly: dto.reduceOnly ?? false,
    };
    const decision = evaluateOrder({
      proposal,
      account: this.buildRiskAccount(account, positions, oracle),
      config: riskConfig ?? DEFAULT_RISK_CONFIG,
    });
    if (!decision.approved) {
      throw new BadRequestException(
        `Order rejected by risk engine: ${decision.reasons.join('; ')}`,
      );
    }

    const request: BrokerOrderRequest = {
      side: dto.side,
      type: dto.type,
      symbol: dto.symbol,
      quantity: dto.quantity,
      price: dto.type === 'limit' ? dto.price : undefined,
      stopLoss: dto.stopLoss,
      takeProfit: dto.takeProfit,
      reduceOnly: dto.reduceOnly ?? false,
      clientOrderId,
    };
    const placed = await broker.placeOrder(request);
    const executed = await broker.applyMarket(oracle, placed.id);

    return this.persistOutcome(
      account,
      positions,
      clientOrderId,
      executed,
      oracle,
      botContext,
    );
  }

  /**
   * Fills resting ACCEPTED limit orders that have become marketable, applying
   * the same ledger math as market fills but at the limit price. Called by the
   * bot engine before each cycle tick (the Phase 6 deferred fill issue).
   *
   * Never fills into negative cash and never sells without a held position —
   * questionable rests are REJECTED with a reason instead.
   */
  async settleLimitOrders(
    userId: string,
    accountId: string,
  ): Promise<PaperOrderEntity[]> {
    const account = await this.ownedAccount(userId, accountId);
    if (account.status !== 'ACTIVE') {
      throw new BadRequestException('Paper account is not active');
    }
    const resting = await this.orders.listByAccount(accountId, {
      status: 'ACCEPTED',
    });
    const filled: PaperOrderEntity[] = [];
    for (const order of resting) {
      const settled = await this.maybeFillRestingOrder(account, order);
      if (settled) {
        filled.push(settled);
      }
    }
    return filled;
  }

  private async maybeFillRestingOrder(
    account: PaperAccountEntity,
    order: PaperOrderEntity,
  ): Promise<PaperOrderEntity | null> {
    if (order.type !== 'limit' || order.price === null) {
      return null;
    }
    const ticker = await this.marketsService.getTicker(order.symbol);
    if (!ticker) {
      return null;
    }

    const limit = toDecimal(order.price);
    const market = toDecimal(ticker.lastPrice);
    const marketable =
      order.side === 'buy' ? market.lte(limit) : market.gte(limit);
    if (!marketable) {
      return null;
    }

    const positions = await this.positions.listByAccount(account.id);
    const notional = toDecimal(order.quantity).times(limit);
    const fee = notional.times(order.feeRate);

    if (order.side === 'sell') {
      const held = positions.find((p) => p.symbol === order.symbol);
      if (!held || toDecimal(held.quantity).lt(order.quantity)) {
        order.status = 'REJECTED';
        order.reason = 'No held position at settlement';
        return this.orders.save(order);
      }
    } else if (toDecimal(account.freeCash).lt(notional.plus(fee))) {
      order.status = 'REJECTED';
      order.reason = 'Insufficient cash at settlement';
      return this.orders.save(order);
    }

    const prior = positions.find((p) => p.symbol === order.symbol);
    const now = Date.now();
    const executed: BrokerOrder = {
      id: order.brokerOrderId ?? randomUUID(),
      clientOrderId: order.clientOrderId,
      side: order.side,
      type: 'limit',
      symbol: order.symbol,
      quantity: order.quantity,
      filledQuantity: order.quantity,
      avgFillPrice: limit.toString(),
      price: limit.toString(),
      fees: fee.toString(),
      status: 'FILLED',
      reduceOnly: order.reduceOnly,
      createdAt: order.createdAt.getTime(),
      updatedAt: now,
    };

    if (executed.side === 'buy') {
      await this.applyBuyFill(account, prior, executed);
      account.freeCash = this.freeCashAfterBuy(
        account.freeCash,
        executed,
      ).toString();
    } else {
      await this.applySellFill(account, prior, executed);
      account.freeCash = this.freeCashAfterSell(
        account.freeCash,
        executed,
      ).toString();
    }
    account.totalFeesPaid = add(
      account.totalFeesPaid,
      executed.fees,
    ).toString();
    await this.accounts.save(account);

    order.status = 'FILLED';
    order.filledQuantity = this.money(executed.filledQuantity);
    order.avgFillPrice = limit.toString();
    order.fees = this.money(executed.fees);
    order.reason = null;
    const persisted = await this.orders.save(order);

    await this.appendSnapshot(account, order.symbol);
    return persisted;
  }

  async listOrders(
    userId: string,
    accountId: string,
    filters: {
      symbol?: string;
      status?: PaperOrderStatus;
      limit?: number;
    } = {},
  ): Promise<PaperOrderEntity[]> {
    await this.ownedAccount(userId, accountId);
    const orders = await this.orders.listByAccount(accountId, {
      status: filters.status,
      limit: filters.limit,
    });
    if (!filters.symbol) {
      return orders;
    }
    return orders.filter((order) => order.symbol === filters.symbol);
  }

  async getPositions(
    userId: string,
    accountId: string,
  ): Promise<
    Array<
      PaperPositionEntity & {
        markPrice: string;
        positionValue: string;
        unrealizedPnl: string;
      }
    >
  > {
    await this.ownedAccount(userId, accountId);
    const positions = await this.positions.listByAccount(accountId);
    return Promise.all(
      positions.map(async (position) => {
        const ticker = await this.marketsService.getTicker(position.symbol);
        const mark = ticker?.lastPrice ?? position.avgEntryPrice;
        const unrealizedPnl = mul(
          position.quantity,
          sub(mark, position.avgEntryPrice),
        ).toString();
        const positionValue = mul(position.quantity, mark).toString();
        return { ...position, markPrice: mark, positionValue, unrealizedPnl };
      }),
    );
  }

  async getPortfolio(
    userId: string,
    accountId: string,
  ): Promise<{
    accountId: string;
    equity: string;
    cash: string;
    positionValue: string;
    realizedPnl: string;
    updatedAt: Date | null;
  }> {
    const account = await this.ownedAccount(userId, accountId);
    const latest = await this.portfolios.latestByAccount(accountId);
    if (!latest) {
      return {
        accountId,
        equity: account.freeCash,
        cash: account.freeCash,
        positionValue: '0',
        realizedPnl: account.realizedPnl,
        updatedAt: null,
      };
    }
    return {
      accountId,
      equity: latest.equity,
      cash: latest.cash,
      positionValue: latest.positionValue,
      realizedPnl: latest.realizedPnl,
      updatedAt: latest.createdAt,
    };
  }

  private async ownedAccount(
    userId: string,
    accountId: string,
  ): Promise<PaperAccountEntity> {
    const account = await this.accounts.findByUserIdAndId(userId, accountId);
    if (!account) {
      throw new NotFoundException('Paper account not found');
    }
    return account;
  }

  private async oracleFor(symbol: string): Promise<MonetaryOracle | null> {
    const ticker = await this.marketsService.getTicker(symbol);
    if (!ticker) {
      return null;
    }
    return {
      symbol,
      price: ticker.lastPrice,
      timestamp: Date.now(),
    };
  }

  /**
   * Server-derived risk facts. Prices always come from ledger/market data,
   * never from the request (AGENTS.md §18).
   */
  private buildRiskAccount(
    account: PaperAccountEntity,
    positions: PaperPositionEntity[],
    oracle: MonetaryOracle,
  ): RiskAccountState {
    let equity = toDecimal(account.freeCash);
    for (const position of positions) {
      equity = equity.plus(mul(position.quantity, position.avgEntryPrice));
    }
    const held = positions.find(
      (position) => position.symbol === oracle.symbol,
    );
    if (held) {
      const unrealized = mul(
        held.quantity,
        sub(oracle.price, held.avgEntryPrice),
      );
      equity = equity.plus(unrealized);
    }

    const exposureNotional = positions.reduce((sum, position) => {
      const mark =
        position.symbol === oracle.symbol
          ? oracle.price
          : position.avgEntryPrice;
      return sum.plus(mul(position.quantity, mark));
    }, toDecimal('0'));
    const currentExposure = equity.isZero()
      ? '0'
      : exposureNotional.div(equity).toString();

    return {
      equity: equity.toString(),
      realizedPnlToday: account.realizedPnl,
      openPositions: positions.length,
      currentExposure,
      currentDrawdown: '0',
      heldPosition: held
        ? { quantity: held.quantity, side: 'long' }
        : undefined,
    };
  }

  /**
   * Writes the broker outcome back to the ledger and captures a portfolio
   * snapshot. Sequential saves are kept deliberately small; a DB transaction
   * around the whole order becomes worthwhile once the bot engine needs
   * concurrency (Phase 7).
   */
  private async persistOutcome(
    account: PaperAccountEntity,
    positions: PaperPositionEntity[],
    clientOrderId: string,
    executed: BrokerOrder,
    oracle: MonetaryOracle,
    botContext?: { botId: string; botRunId: string } | null,
  ): Promise<PaperOrderEntity> {
    const prior = positions.find(
      (position) => position.symbol === executed.symbol,
    );
    const filledQuantity = toDecimal(executed.filledQuantity);
    const isFilled = executed.status === 'FILLED';

    if (isFilled && filledQuantity.gt(0)) {
      if (executed.side === 'buy') {
        await this.applyBuyFill(account, prior, executed);
        account.freeCash = this.freeCashAfterBuy(
          account.freeCash,
          executed,
        ).toString();
      } else {
        await this.applySellFill(account, prior, executed);
        account.freeCash = this.freeCashAfterSell(
          account.freeCash,
          executed,
        ).toString();
      }
    }

    account.totalFeesPaid = add(
      account.totalFeesPaid,
      executed.fees,
    ).toString();
    await this.accounts.save(account);

    const order = new PaperOrderEntity();
    order.accountId = account.id;
    order.clientOrderId = clientOrderId;
    order.brokerOrderId = executed.id;
    order.botId = botContext?.botId ?? null;
    order.botRunId = botContext?.botRunId ?? null;
    order.side = executed.side;
    order.type = executed.type;
    order.symbol = executed.symbol;
    order.quantity = this.money(executed.quantity);
    order.price = this.moneyOrNull(executed.price);
    order.stopLoss = this.moneyOrNull(executed.stopLoss);
    order.takeProfit = this.moneyOrNull(executed.takeProfit);
    order.reduceOnly = executed.reduceOnly ?? false;
    order.feeRate = '0.001';
    order.slippageRate = '0';
    order.status = this.mapStatus(executed.status);
    order.filledQuantity = this.money(executed.filledQuantity);
    order.avgFillPrice = this.moneyOrNull(executed.avgFillPrice);
    order.fees = this.money(executed.fees);
    order.reason = executed.reason ?? null;
    const persisted = await this.orders.save(order);

    await this.appendSnapshot(account, oracle.symbol);
    return persisted;
  }

  private async applyBuyFill(
    account: PaperAccountEntity,
    prior: PaperPositionEntity | undefined,
    executed: BrokerOrder,
  ): Promise<void> {
    const prevQty = toDecimal(prior?.quantity ?? '0');
    const prevAvg = toDecimal(prior?.avgEntryPrice ?? '0');
    const fillPrice = toDecimal(executed.avgFillPrice ?? '0');
    const qty = toDecimal(executed.filledQuantity);
    const totalQty = prevQty.plus(qty);

    const position = prior ?? new PaperPositionEntity();
    position.accountId = account.id;
    position.symbol = executed.symbol;
    position.side = 'long';
    position.quantity = totalQty.toString();
    position.avgEntryPrice = prevQty.isZero()
      ? fillPrice.toString()
      : prevAvg
          .times(prevQty)
          .plus(fillPrice.times(qty))
          .div(totalQty)
          .toString();
    position.fees = add(prior?.fees ?? '0', executed.fees).toString();
    position.realizedPnl = prior?.realizedPnl ?? '0';
    await this.positions.save(position);
  }

  private async applySellFill(
    account: PaperAccountEntity,
    prior: PaperPositionEntity | undefined,
    executed: BrokerOrder,
  ): Promise<void> {
    if (!prior) {
      throw new BadRequestException('Sell require a prior held position');
    }
    const prevQty = toDecimal(prior.quantity);
    const avgEntry = toDecimal(prior.avgEntryPrice);
    const fillPrice = toDecimal(executed.avgFillPrice ?? '0');
    const qty = toDecimal(executed.filledQuantity);
    const remaining = prevQty.minus(qty);

    const closePnl = fillPrice.minus(avgEntry).times(qty).minus(executed.fees);
    const realizedTotal = add(
      prior.realizedPnl,
      closePnl.toString(),
    ).toString();
    account.realizedPnl = add(
      account.realizedPnl,
      closePnl.toString(),
    ).toString();

    if (remaining.gt(0)) {
      prior.quantity = remaining.toString();
      prior.fees = add(prior.fees, executed.fees).toString();
      prior.realizedPnl = realizedTotal;
      await this.positions.save(prior);
    } else {
      await this.positions.deleteByAccountAndSymbol(account.id, prior.symbol);
    }
  }

  /** Ledger free-cash after a filled buy, matching the paper broker's math. */
  private freeCashAfterBuy(freeCash: string, executed: BrokerOrder): string {
    const fillPrice = toDecimal(executed.avgFillPrice ?? '0');
    const qty = toDecimal(executed.filledQuantity);
    const fee = toDecimal(executed.fees);
    return toDecimal(freeCash)
      .minus(fillPrice.times(qty))
      .minus(fee)
      .toString();
  }

  /** Ledger free-cash after a filled sell (reduces a long), broker-matching. */
  private freeCashAfterSell(freeCash: string, executed: BrokerOrder): string {
    const fillPrice = toDecimal(executed.avgFillPrice ?? '0');
    const qty = toDecimal(executed.filledQuantity);
    const fee = toDecimal(executed.fees);
    return toDecimal(freeCash).plus(fillPrice.times(qty)).minus(fee).toString();
  }

  private async appendSnapshot(
    account: PaperAccountEntity,
    symbol: string,
  ): Promise<void> {
    const positions = await this.positions.listByAccount(account.id);
    const ticker = await this.marketsService.getTicker(symbol);
    const mark = ticker?.lastPrice ?? '0';
    const positionValue = positions.reduce(
      (sum, position) => sum.plus(mul(position.quantity, mark)),
      toDecimal('0'),
    );

    const snapshot = new PaperPortfolioSnapshotEntity();
    snapshot.accountId = account.id;
    snapshot.cash = account.freeCash;
    snapshot.positionValue = positionValue.toString();
    snapshot.equity = add(
      account.freeCash,
      positionValue.toString(),
    ).toString();
    snapshot.realizedPnl = account.realizedPnl;
    await this.portfolios.append(snapshot);
  }

  private mapStatus(status: string) {
    return status as PaperOrderEntity['status'];
  }

  /** Normalize a Money value to its decimal string form. */
  private money(value: Money): string {
    return toDecimal(value).toString();
  }

  /** Normalize an optional Money value, preserving null. */
  private moneyOrNull(value: Money | undefined | null): string | null {
    return value === undefined || value === null ? null : this.money(value);
  }
}
