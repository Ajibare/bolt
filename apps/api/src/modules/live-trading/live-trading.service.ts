import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_RISK_CONFIG,
  evaluateOrder,
  validateRiskConfig,
  type OrderProposal,
  type RiskConfig,
} from '@trading-bolt/risk-engine';
import {
  type BrokerAccountState,
  type BrokerOrder,
  type BrokerOrderRequest,
  type BrokerPosition,
  type MonetaryOracle,
} from '@trading-bolt/broker-adapters';
import { toDecimal, type Money } from '@trading-bolt/shared';
import { BrokersService } from '../brokers/brokers.service.js';
import { MarketsService } from '../markets/markets.service.js';
import {
  PaperAccountRepository,
  PaperOrderRepository,
} from '../paper-trading/paper-trading.repository.js';
import { PaperOrderEntity } from '../paper-trading/entities/paper-trading.entity.js';
import { ReconciliationProducer } from '../reconciliation/reconciliation.producer.js';
import {
  CircuitBreakerOpenError,
  CircuitBreakerService,
} from './circuit-breaker.service.js';

export interface PlaceLiveOrderInput {
  accountId: string;
  botId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: Money;
  price?: Money;
  stopLoss?: Money;
  takeProfit?: Money;
  reduceOnly?: boolean;
  /** Caller-supplied idempotency key (unique per order, AGENTS.md §16). */
  clientOrderId?: string;
  /** Server-side risk policy override, never client-supplied (AGENTS.md §18). */
  riskConfig?: Partial<RiskConfig> | null;
}

export interface EmergencyFlattenInput {
  accountId: string;
  botId: string;
  symbol: string;
}

/** Local statuses that mean "can no longer be cancelled at the broker". */
const NON_CANCELLABLE_STATUSES: ReadonlySet<string> = new Set([
  'FILLED',
  'REJECTED',
  'FAILED',
]);

/**
 * Read-only view over the configured live broker account for the frontend
 * monitor (AGENTS.md §22/§23). Never contains credentials. Sub-resources that
 * fail are surfaced as warnings so one broker hiccup does not blank the whole
 * account.
 */
export interface LiveOrderView extends BrokerOrder {
  /**
   * Local `paper_orders` id when the broker order was placed by Trading Bolt
   * (so the UI can cancel it), or null for orders placed outside the platform.
   */
  localId: string | null;
}

export interface LiveAccountView {
  configured: boolean;
  environment: 'demo' | 'testnet' | 'mainnet' | null;
  balances: BrokerAccountState['balances'] | null;
  /** Sum of all balance totals (equity). */
  equity: string | null;
  /** Sum of all balance free amounts. */
  freeBalance: string | null;
  positions: BrokerPosition[] | null;
  openOrders: LiveOrderView[] | null;
  circuitBreakers: Array<{
    severity: string;
    reason: string;
    trippedAtMs: number;
  }>;
  warnings: string[];
}

/**
 * Risk-gated execution against a live broker (AGENTS.md §9-12/§16/§18/§19).
 *
 * Every live order passes the risk engine (and the circuit breaker) BEFORE
 * reaching the adapter. Orders are persisted with `provider='bybit'` and a
 * broker order id; a freshly submitted live order is SUBMITTED — its fill
 * state converges exclusively through reconciliation (AGENTS.md §17). This
 * service never guesses a fill.
 */
@Injectable()
export class LiveTradingService {
  private readonly logger = new Logger(LiveTradingService.name);

  constructor(
    private readonly orders: PaperOrderRepository,
    private readonly accounts: PaperAccountRepository,
    private readonly brokers: BrokersService,
    private readonly markets: MarketsService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly reconciliation: ReconciliationProducer,
  ) {}

  async placeOrder(input: PlaceLiveOrderInput): Promise<PaperOrderEntity> {
    const adapter = this.brokers.getBybitAdapter();
    if (!adapter) {
      throw new BadRequestException(
        'Live broker not configured (BYBIT_API_KEY/BYBIT_API_SECRET required)',
      );
    }

    const clientOrderId = input.clientOrderId ?? randomUUID();
    const existing = await this.orders.findByAccountAndClientOrderId(
      input.accountId,
      clientOrderId,
    );
    if (existing) {
      return existing;
    }

    const oracle = await this.oracleFor(input.symbol);
    if (!oracle) {
      throw new BadRequestException(
        `No market price available for ${input.symbol}`,
      );
    }

    const riskConfig = validateRiskConfig(
      input.riskConfig ?? DEFAULT_RISK_CONFIG,
    );
    const facts = await this.accountFacts(input, oracle);
    const reduceOnly = input.reduceOnly ?? false;

    if (!reduceOnly) {
      await this.circuitBreaker.assertTradingAllowed(
        input.accountId,
        input.botId,
        facts,
        riskConfig,
      );
    }

    const proposal: OrderProposal = {
      symbol: input.symbol,
      side: input.side,
      quantity: input.quantity,
      price: oracle.price,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      reduceOnly,
    };
    const decision = evaluateOrder({
      proposal,
      account: facts,
      config: riskConfig,
      openBreakers: this.circuitBreaker.openSeverities(
        input.accountId,
        input.botId,
      ),
    });
    if (!decision.approved) {
      this.handleRejection(
        decision.results
          .filter((result) => !result.passed)
          .map((result) => result.rule),
      );
    }

    const request: BrokerOrderRequest = {
      side: input.side,
      type: input.type,
      symbol: input.symbol,
      quantity: input.quantity,
      price: input.type === 'limit' ? input.price : undefined,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      reduceOnly,
      clientOrderId,
    };
    const placed = await adapter.placeOrder(request);

    const order = new PaperOrderEntity();
    order.accountId = input.accountId;
    order.clientOrderId = clientOrderId;
    order.brokerOrderId = placed.id;
    order.provider = 'bybit';
    order.brokerStatus = placed.status;
    order.lastSyncedAt = new Date();
    order.side = placed.side;
    order.type = placed.type;
    order.symbol = placed.symbol;
    order.quantity = this.money(placed.quantity);
    order.price = this.moneyOrNull(placed.price);
    order.stopLoss = this.moneyOrNull(placed.stopLoss);
    order.takeProfit = this.moneyOrNull(placed.takeProfit);
    order.reduceOnly = placed.reduceOnly ?? false;
    order.feeRate = '0.001';
    order.slippageRate = '0';
    order.status = placed.status;
    order.filledQuantity = this.money(placed.filledQuantity);
    order.avgFillPrice = this.moneyOrNull(placed.avgFillPrice);
    order.fees = this.money(placed.fees);
    order.reason = placed.reason ?? null;
    const persisted = await this.orders.save(order);

    await this.reconciliation.enqueue(input.accountId);
    this.logger.log('ORDER_SUBMITTED', {
      orderId: persisted.id,
      provider: 'bybit',
      symbol: placed.symbol,
      side: placed.side,
      status: placed.status,
    });
    return persisted;
  }

  /** Signed broker-held quantity in a symbol (0 = flat), for intent sizing. */
  async getHeldQuantity(
    accountId: string,
    symbol: string,
  ): Promise<string | null> {
    const adapter = this.brokers.getBybitAdapter();
    if (!adapter) {
      throw new BadRequestException('Live broker not configured');
    }
    const positions = await adapter.getPositions(symbol);
    const held = positions.find((position) => position.symbol === symbol);
    return held ? this.money(held.quantity) : null;
  }

  /**
   * Cancels a live order at the broker. Ownership is enforced server-side so
   * no caller can cancel another user's order (AGENTS.md §23). The local row
   * is NOT marked CANCELLED here — status converges through reconciliation so
   * we never fabricate a broker state (AGENTS.md §17). Already-cancelled
   * cancels are idempotent.
   */
  async cancelOrder(
    userId: string,
    orderId: string,
  ): Promise<PaperOrderEntity> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    const owned = await this.accounts.findByUserIdAndId(
      userId,
      order.accountId,
    );
    if (!owned) {
      throw new BadRequestException('Order not found');
    }
    const adapter = this.brokers.getBybitAdapter();
    if (!adapter) {
      throw new BadRequestException('Live broker not configured');
    }
    if (order.provider !== 'bybit') {
      throw new BadRequestException(
        'Only live broker orders can be cancelled via the broker',
      );
    }
    if (!order.brokerOrderId) {
      throw new BadRequestException('Order has no broker reference');
    }
    if (order.status === 'CANCELLED') {
      return order;
    }
    if (NON_CANCELLABLE_STATUSES.has(order.status)) {
      throw new BadRequestException(
        `Cannot cancel an order in status ${order.status}`,
      );
    }
    await adapter.cancelOrder(order.brokerOrderId);
    await this.reconciliation.enqueue(order.accountId);
    this.logger.log('ORDER_CANCELLATION_SUBMITTED', {
      orderId: order.id,
      brokerOrderId: order.brokerOrderId,
      provider: 'bybit',
    });
    return order;
  }

  /**
   * Emergency de-risking (AGENTS.md §19): cancels open live orders on the
   * symbol and flattens the broker-held position with reduce-only market
   * orders. Reduce-only closes are never blocked by the circuit breaker, so a
   * kill switch can always reduce exposure. Errors on individual cancels are
   * logged and swallowed so flattening still completes.
   */
  async emergencyFlatten(input: EmergencyFlattenInput): Promise<void> {
    const adapter = this.brokers.getBybitAdapter();
    if (!adapter) {
      throw new BadRequestException('Live broker not configured');
    }

    let openOrders: BrokerOrder[] = [];
    try {
      openOrders = await adapter.getOpenOrders(input.symbol);
    } catch (error) {
      this.logger.warn('EMERGENCY_FLATTEN_OPEN_ORDERS_FAILED', {
        symbol: input.symbol,
        error: (error as Error).message,
      });
    }
    for (const open of openOrders) {
      try {
        await adapter.cancelOrder(open.id);
      } catch (error) {
        this.logger.warn('EMERGENCY_FLATTEN_CANCEL_FAILED', {
          orderId: open.id,
          error: (error as Error).message,
        });
      }
    }

    let positions: BrokerPosition[] = [];
    try {
      positions = await adapter.getPositions(input.symbol);
    } catch (error) {
      this.logger.warn('EMERGENCY_FLATTEN_POSITIONS_FAILED', {
        symbol: input.symbol,
        error: (error as Error).message,
      });
    }
    const held = positions.find((position) => position.symbol === input.symbol);
    const quantity = toDecimal(held?.quantity ?? '0');
    if (!quantity.isZero()) {
      await this.placeOrder({
        accountId: input.accountId,
        botId: input.botId,
        symbol: input.symbol,
        side: quantity.isPositive() ? 'sell' : 'buy',
        type: 'market',
        quantity: quantity.abs().toString(),
        reduceOnly: true,
        clientOrderId: `bolt-flatten-${Date.now()}-${input.botId.slice(0, 8)}`,
      });
    }

    await this.reconciliation.enqueue(input.accountId);
    this.logger.log('EMERGENCY_FLATTEN_COMPLETED', {
      accountId: input.accountId,
      botId: input.botId,
      symbol: input.symbol,
      cancelledPending: openOrders.length,
      closedQuantity: quantity.toString(),
    });
  }

  /**
   * Assembles the broker account monitor view. Fails closed to a
   * `configured: false` shape when no adapter is present; individual adapter
   * reads are wrapped so a failure in one surface degrades to a warning.
   */
  async getAccountView(): Promise<LiveAccountView> {
    const adapter = this.brokers.getBybitAdapter();
    const circuitBreakers = [...this.circuitBreaker.open()];
    const base = {
      environment: this.brokers.environment(),
      circuitBreakers,
      warnings: [],
    };
    if (!adapter) {
      return {
        configured: false,
        environment: base.environment,
        balances: null,
        equity: null,
        freeBalance: null,
        positions: null,
        openOrders: null,
        circuitBreakers,
        warnings: [],
      };
    }

    const warnings: string[] = [];
    let state: BrokerAccountState | null = null;
    let positions: BrokerPosition[] | null = null;
    let openOrders: LiveOrderView[] | null = null;

    try {
      state = await adapter.getAccountState();
    } catch (error) {
      warnings.push(`Account balance unavailable: ${this.errorDetail(error)}`);
    }
    try {
      positions = await adapter.getPositions();
    } catch (error) {
      warnings.push(`Positions unavailable: ${this.errorDetail(error)}`);
    }
    try {
      const raw = await adapter.getOpenOrders();
      openOrders = await this.withLocalOrderIds(raw);
    } catch (error) {
      warnings.push(`Open orders unavailable: ${this.errorDetail(error)}`);
    }

    return {
      configured: true,
      environment: base.environment,
      balances: state?.balances ?? null,
      equity: state
        ? state.balances
            .reduce(
              (sum, balance) => sum.plus(toDecimal(balance.total)),
              toDecimal('0'),
            )
            .toString()
        : null,
      freeBalance: state
        ? state.balances
            .reduce(
              (sum, balance) => sum.plus(toDecimal(balance.free)),
              toDecimal('0'),
            )
            .toString()
        : null,
      positions,
      openOrders,
      circuitBreakers,
      warnings,
    };
  }

  /** Maps a decision rejection into its behavior: breaker trip or plain risk rejection. */
  private handleRejection(failedRules: string[]): never {
    if (
      failedRules.some(
        (rule) =>
          rule === 'circuit-breaker' ||
          rule === 'max-daily-loss' ||
          rule === 'max-drawdown',
      )
    ) {
      throw new CircuitBreakerOpenError(failedRules.join(', '));
    }
    throw new BadRequestException(
      `Order rejected by risk engine: ${failedRules.join(', ')}`,
    );
  }

  /**
   * Builds server-side risk facts from broker-observed state + intraday
   * tracker. Equity comes from the broker wallet; nothing is client-supplied.
   */
  private async accountFacts(
    input: PlaceLiveOrderInput,
    oracle: MonetaryOracle | null,
  ): Promise<Awaited<ReturnType<CircuitBreakerService['observeAccount']>>> {
    const adapter = this.brokers.getBybitAdapter();
    if (!adapter) {
      throw new BadRequestException('Live broker not configured');
    }
    const state: BrokerAccountState = await adapter.getAccountState();
    const positions: BrokerPosition[] = await adapter.getPositions(
      input.symbol,
    );
    const equity = state.balances.reduce(
      (sum, balance) => sum.plus(toDecimal(balance.total)),
      toDecimal('0'),
    );

    const held = positions.find((position) => position.symbol === input.symbol);
    const markPrice = oracle?.price ?? input.price ?? '0';
    const heldQuantity = held?.quantity ?? '0';

    return this.circuitBreaker.observeAccount(
      {
        equity: equity.toString(),
        openPositions: positions.length,
        exposureNotional: toDecimal(heldQuantity)
          .abs()
          .times(markPrice)
          .toString(),
        markPrice,
        heldQuantity,
      },
      input.accountId,
    );
  }

  private async oracleFor(symbol: string): Promise<MonetaryOracle | null> {
    const ticker = await this.markets.getTicker(symbol);
    if (!ticker) {
      return null;
    }
    return { symbol, price: ticker.lastPrice, timestamp: Date.now() };
  }

  private money(value: Money): string {
    return toDecimal(value).toString();
  }

  private moneyOrNull(value: Money | undefined | null): string | null {
    return value === undefined || value === null ? null : this.money(value);
  }

  private errorDetail(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown broker error';
  }

  /**
   * Attaches the local `paper_orders` id to each broker open order when one
   * exists, so the UI can cancel it through the ownership-checked endpoint.
   * Orders placed outside Trading Bolt stay `localId: null` (no cancel handle).
   */
  private async withLocalOrderIds(
    orders: BrokerOrder[],
  ): Promise<LiveOrderView[]> {
    const locals =
      orders.length > 0
        ? await this.orders.findLiveByBrokerOrderIds(
            orders.map((order) => order.id),
          )
        : [];
    const localByBrokerId = new Map<string, string>();
    for (const local of locals) {
      if (local.brokerOrderId) {
        localByBrokerId.set(local.brokerOrderId, local.id);
      }
    }
    return orders.map((order) => ({
      ...order,
      localId: localByBrokerId.get(order.id) ?? null,
    }));
  }
}
