import { randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import type {
  BrokerAccountState,
  BrokerAdapter,
  BrokerOrder,
  BrokerOrderIdentity,
  BrokerOrderRequest,
  BrokerPosition,
} from "../broker.interface.js";
import { OrderNotFoundError, InvalidOrderRequestError } from "../errors.js";
import { ensureValidOrder, evaluatePaperOrder } from "./paper-execution.js";
import { isTerminal, transition } from "./order-lifecycle.js";
import type {
  MonetaryOracle,
  PaperBrokerConfig,
  PaperBrokerSnapshot,
  PaperOrderState,
} from "./types.js";

/**
 * Paper broker: a deterministic, in-memory implementation of BrokerAdapter
 * (AGENTS.md §11-12). Simulates fills against an injected oracle price. Never
 * touches a real exchange; risks of accidental live routing are impossible by
 * construction. Order intent is idempotent per clientOrderId.
 */
export class PaperBroker implements BrokerAdapter {
  readonly kind = "paper" as const;
  private readonly feeRate: Decimal;
  private readonly slippage: Decimal;
  private cash: Decimal;
  private qty: Decimal;
  private avgEntry: Decimal;
  private positionFees: Decimal;
  private heldSymbol: string | null = null;
  private readonly orders = new Map<string, PaperOrderState>();
  private readonly byClientOrderId = new Map<string, string>();

  constructor(config: PaperBrokerConfig) {
    this.feeRate = new Decimal(config.feeRate ?? "0");
    this.slippage = new Decimal(config.slippage ?? "0");
    this.cash = new Decimal(config.initialFreeCash ?? config.startingCash);
    this.qty = new Decimal(0);
    this.avgEntry = new Decimal(0);
    this.positionFees = new Decimal(0);
    const first = config.initialPositions?.[0];
    if (first) {
      this.heldSymbol = first.symbol;
      this.qty = new Decimal(first.quantity);
      this.avgEntry = new Decimal(first.avgEntryPrice);
      this.positionFees = new Decimal(first.fees);
    }
  }

  private snapshot(): PaperBrokerSnapshot {
    return {
      freeCash: this.cash.toString(),
      heldQuantity:
        this.qty.isZero() || this.heldSymbol === null
          ? null
          : {
              symbol: this.heldSymbol,
              quantity: this.qty.toString(),
              avgEntryPrice: this.avgEntry.toString(),
            },
    };
  }

  async placeOrder(request: BrokerOrderRequest): Promise<BrokerOrder> {
    if (!request.clientOrderId || request.clientOrderId.length === 0) {
      throw new InvalidOrderRequestError("clientOrderId is required");
    }
    const existingId = this.byClientOrderId.get(request.clientOrderId);
    if (existingId) {
      const existing = this.orders.get(existingId);
      if (!existing) {
        throw new Error("Idempotency entry without order state");
      }
      return this.toBrokerOrder(existing);
    }

    const now = Date.now();
    const order: PaperOrderState = {
      id: randomUUID(),
      clientOrderId: request.clientOrderId,
      side: request.side,
      type: request.type,
      symbol: request.symbol,
      quantity: request.quantity,
      price: request.price,
      stopLoss: request.stopLoss,
      takeProfit: request.takeProfit,
      reduceOnly: request.reduceOnly,
      feeRate: this.feeRate.toString(),
      slippage: this.slippage.toString(),
      status: "CREATED",
      filledQuantity: "0",
      avgFillPrice: null,
      fees: "0",
      createdAt: now,
      updatedAt: now,
    };
    ensureValidOrder(order);
    transition(order.status, "SUBMITTED");
    order.status = "SUBMITTED";
    this.orders.set(order.id, order);
    this.byClientOrderId.set(order.clientOrderId, order.id);
    return this.toBrokerOrder(order);
  }

  /**
   * Simulated fills against an injected oracle price. The paper broker never
   * touches a real exchange (AGENTS.md §11-12): paper order intents are
   * executed purely against the current market price.
   */
  async applyMarket(oracle: MonetaryOracle, orderId: string): Promise<BrokerOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }
    if (isTerminal(order.status)) {
      return this.toBrokerOrder(order);
    }
    const result = evaluatePaperOrder(this.snapshot(), order, oracle);

    if (order.type === "limit") {
      if (result.status === "FILLED") {
        this.fill(order, result);
      } else if (result.status === "REJECTED" || result.status === "FAILED") {
        transition(order.status, result.status);
        order.status = result.status;
        order.reason = result.reason;
        order.updatedAt = Date.now();
      } else {
        transition(order.status, "ACCEPTED");
        order.status = "ACCEPTED";
        order.updatedAt = Date.now();
      }
    } else {
      // market orders fill immediately at placement with the current oracle.
      if (result.status === "FILLED") {
        this.fill(order, result);
      } else if (result.status === "REJECTED" || result.status === "FAILED") {
        transition(order.status, result.status);
        order.status = result.status;
        order.reason = result.reason;
        order.updatedAt = Date.now();
      }
    }
    return this.toBrokerOrder(order);
  }

  async cancelOrder(orderId: string, _options?: BrokerOrderIdentity): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }
    if (isTerminal(order.status)) {
      throw new InvalidOrderRequestError(
        `Order in terminal state "${order.status}" cannot be cancelled`,
      );
    }
    transition(order.status, "CANCELLED");
    order.status = "CANCELLED";
    order.updatedAt = Date.now();
  }

  async getOrder(orderId: string, _options?: BrokerOrderIdentity): Promise<BrokerOrder | null> {
    const order = this.orders.get(orderId);
    return order ? this.toBrokerOrder(order) : null;
  }

  async getOpenOrders(symbol?: string): Promise<BrokerOrder[]> {
    return [...this.orders.values()]
      .filter((o) => !isTerminal(o.status))
      .filter((o) => !symbol || o.symbol === symbol)
      .map((o) => this.toBrokerOrder(o));
  }

  async getPositions(symbol?: string): Promise<BrokerPosition[]> {
    if (this.qty.isZero() || this.heldSymbol === null) {
      return [];
    }
    if (symbol && this.heldSymbol !== symbol) {
      return [];
    }
    return [
      {
        symbol: this.heldSymbol,
        quantity: this.qty.toString(),
        avgEntryPrice: this.avgEntry.toString(),
        fees: this.positionFees.toString(),
      },
    ];
  }

  async getAccountState(): Promise<BrokerAccountState> {
    return {
      balances: [
        {
          asset: "USDT",
          free: this.cash.toString(),
          used: "0",
          total: this.cash.toString(),
        },
      ],
    };
  }

  private fill(
    order: PaperOrderState,
    result: { status: string; fillPrice?: string; filledQuantity: string; fee: string },
  ): void {
    const price = new Decimal(result.fillPrice ?? "0");
    const qty = new Decimal(result.filledQuantity);
    const fee = new Decimal(result.fee);

    if (order.side === "buy") {
      this.cash = this.cash.minus(price.times(qty)).minus(fee);
    } else {
      this.cash = this.cash.plus(price.times(qty)).minus(fee);
    }
    this.positionFees = this.positionFees.plus(fee);

    const prevQty = this.qty;
    const prevAvg = this.avgEntry;
    if (order.side === "buy") {
      const totalQty = prevQty.plus(qty);
      this.avgEntry = prevQty.isZero()
        ? price
        : prevAvg.times(prevQty).plus(price.times(qty)).div(totalQty);
      this.qty = totalQty;
      this.heldSymbol = this.heldSymbol ?? order.symbol;
    } else {
      const remaining = prevQty.minus(qty);
      this.qty = remaining.isNegative() ? new Decimal(0) : remaining;
      if (this.qty.isZero()) {
        this.avgEntry = new Decimal(0);
        this.positionFees = new Decimal(0);
        this.heldSymbol = null;
      }
    }

    order.filledQuantity = new Decimal(order.filledQuantity).plus(qty).toString();
    order.avgFillPrice = price.toString();
    order.fees = new Decimal(order.fees).plus(fee).toString();
    order.status = "FILLED";
    order.updatedAt = Date.now();
  }

  private toBrokerOrder(order: PaperOrderState): BrokerOrder {
    return {
      id: order.id,
      clientOrderId: order.clientOrderId,
      side: order.side,
      type: order.type,
      symbol: order.symbol,
      quantity: order.quantity,
      price: order.price,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      reduceOnly: order.reduceOnly,
      reason: order.reason,
      avgFillPrice: order.avgFillPrice,
      filledQuantity: order.filledQuantity,
      fees: order.fees,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
