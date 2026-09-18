import { Decimal } from "decimal.js";
import type {
  BrokerAccountState,
  BrokerAdapter,
  BrokerOrder,
  BrokerOrderIdentity,
  BrokerOrderRequest,
  BrokerPosition,
  ProtectiveBracket,
  ProtectiveBracketInput,
} from "../broker.interface.js";
import { BrokerError, InvalidOrderRequestError } from "../errors.js";
import { BinanceHttpClient } from "./http-client.js";
import {
  mapAccountState,
  mapOrder,
  mapOrderSide,
  mapPositions,
  normalizeQuantity,
  roundToStep,
} from "./mappers.js";
import {
  BinanceApiError,
  BINANCE_BASE_URLS,
  BINANCE_INSTRUMENT_FILTERS,
  isBinanceEnvironment,
  type BinanceAccountInfo,
  type BinanceAdapterConfig,
  type BinanceOcoResponse,
  type BinanceOrderQuery,
  type BinanceOrderResponse,
} from "./types.js";

const ORDER_NOT_FOUND_CODE = -2013;
/** Longest newClientOrderId Binance accepts for a spot order. */
const MAX_CLIENT_ORDER_ID_LENGTH = 36;

/**
 * Live/testnet broker adapter for Binance spot trading (AGENTS.md §11-12).
 *
 * - Only the Binance wire format is handled here; the rest of Trading Bolt
 *   sees `BrokerAdapter`.
 * - `clientOrderId` maps to `newClientOrderId`, giving callers an idempotency
 *   key (AGENTS.md §16).
 * - Fail-closed by construction: the constructor halts without a credential
 *   pair, and unsupported intent is refused instead of being silently dropped
 *   (AGENTS.md §24/§20).
 * - Binance spot cannot attach SL/TP legs to an entry order. Protective
 *   brackets are placed AFTER the entry fills via `/api/v3/order/oco` (see
 *   `attachProtectiveBracket`); the entry call therefore carries the SL/TP
 *   intent as metadata only.
 * - Binance spot does not track position cost basis, so `getPositions`
 *   derives held quantity from account balances with `avgEntryPrice: "0"`.
 *   P&L must never be computed from that field.
 */
export class BinanceAdapter implements BrokerAdapter {
  readonly name = "binance";

  private readonly client: BinanceHttpClient;

  constructor(config: BinanceAdapterConfig) {
    const apiKey = (config.apiKey ?? "").trim();
    const apiSecret = (config.apiSecret ?? "").trim();
    if (!apiKey || !apiSecret) {
      throw new BrokerError("BinanceAdapter requires apiKey and apiSecret (fail-closed).");
    }
    const environment = config.environment ?? "testnet";
    if (!isBinanceEnvironment(environment)) {
      throw new BrokerError(`Unknown Binance environment: ${JSON.stringify(environment)}`);
    }
    this.client = new BinanceHttpClient({
      baseUrl: config.baseUrl ?? BINANCE_BASE_URLS[environment],
      apiKey,
      apiSecret,
      recvWindow: config.recvWindow ?? 5000,
      fetchImpl: config.fetchImpl ?? fetch,
      now: config.now ?? Date.now,
    });
  }

  async placeOrder(request: BrokerOrderRequest): Promise<BrokerOrder> {
    this.validateRequest(request);
    const filter = BINANCE_INSTRUMENT_FILTERS[request.symbol];
    const quantity = normalizeQuantity(request.quantity, filter.qtyStep, request.symbol);

    const params: Record<string, string> = {
      symbol: request.symbol,
      side: mapOrderSide(request.side),
      type: request.type === "limit" ? "LIMIT" : "MARKET",
      quantity,
      newClientOrderId: request.clientOrderId,
    };
    if (request.type === "limit") {
      if (!request.price) {
        throw new InvalidOrderRequestError("Limit orders require a price.");
      }
      params.price = roundToStep(request.price, filter.tickSize);
      params.timeInForce = "GTC";
    }

    const response = await this.client.request<BinanceOrderResponse>(
      "POST",
      "/api/v3/order",
      params,
    );

    if (!response.orderId) {
      throw new BrokerError("Binance accepted the order without returning an orderId.");
    }
    return mapOrder(response, response.transactTime, response.transactTime);
  }

  /**
   * Places a protective bracket against a FILLED long entry (AGENTS.md §14).
   *
   * Binance spot has no short side, so a bracket is always a SELL
   * "limit OCO": one SELL leg at `takeProfit`, and one SELL stop-limit leg
   * that triggers at `stopLoss`. Executing or cancelling either leg cancels
   * the other automatically, which is exactly the SL/TP protection the bot's
   * policy requests. The bracket must only be submitted once the entry has
   * actually filled — Binance rejects a sell that exceeds held balance.
   */
  async attachProtectiveBracket(input: ProtectiveBracketInput): Promise<ProtectiveBracket> {
    const filter = BINANCE_INSTRUMENT_FILTERS[input.symbol];
    if (!filter) {
      throw new InvalidOrderRequestError(
        `Symbol "${input.symbol}" has no instrument filter configured.`,
      );
    }
    if (!input.entryOrderId) {
      throw new InvalidOrderRequestError("entryOrderId is required.");
    }
    if (!input.idempotencyKey || input.idempotencyKey.length > MAX_CLIENT_ORDER_ID_LENGTH) {
      throw new InvalidOrderRequestError(
        `idempotencyKey must be 1-${MAX_CLIENT_ORDER_ID_LENGTH} characters (idempotency).`,
      );
    }
    if (!input.stopLoss || !input.takeProfit) {
      throw new InvalidOrderRequestError(
        "A protective bracket requires both stopLoss and takeProfit.",
      );
    }
    if (new Decimal(input.stopLoss).gte(new Decimal(input.takeProfit))) {
      throw new InvalidOrderRequestError(
        "stopLoss must be below takeProfit for a SELL bracket on a long position.",
      );
    }

    const quantity = normalizeQuantity(input.quantity, filter.qtyStep, input.symbol);
    const params: Record<string, string> = {
      symbol: input.symbol,
      side: "SELL",
      quantity,
      // Take-profit leg (resting SELL above the market).
      price: roundToStep(input.takeProfit, filter.tickSize),
      // Stop-loss leg: trigger + a limit execution depth guard.
      stopPrice: roundToStep(input.stopLoss, filter.tickSize),
      stopLimitPrice: roundToStep(input.stopLoss, filter.tickSize),
      stopLimitTimeInForce: "GTC",
      listClientOrderId: input.idempotencyKey,
    };

    const response = await this.client.request<BinanceOcoResponse>(
      "POST",
      "/api/v3/order/oco",
      params,
    );
    if (!response.orderListId) {
      throw new BrokerError("Binance accepted the OCO without returning an orderListId.");
    }
    return {
      bracketOrderListId: String(response.orderListId),
      createdAt: response.transactionTime,
    };
  }

  async cancelOrder(orderId: string, options?: BrokerOrderIdentity): Promise<void> {
    const symbol = this.requireSymbol("cancelOrder", options);
    await this.client.request<BinanceOrderQuery>("DELETE", "/api/v3/order", {
      symbol,
      orderId,
    });
  }

  async getOrder(orderId: string, options?: BrokerOrderIdentity): Promise<BrokerOrder | null> {
    const symbol = this.requireSymbol("getOrder", options);
    try {
      const response = await this.client.request<BinanceOrderQuery>("GET", "/api/v3/order", {
        symbol,
        orderId,
      });
      return mapOrder(response, response.time, response.updateTime);
    } catch (error) {
      if (error instanceof BinanceApiError && error.code === ORDER_NOT_FOUND_CODE) {
        return null;
      }
      throw error;
    }
  }

  async getOpenOrders(symbol?: string): Promise<BrokerOrder[]> {
    // Binance requires a symbol on this endpoint; sweep the supported list
    // when the caller did not scope the call.
    const symbols = symbol ? [symbol] : Object.keys(BINANCE_INSTRUMENT_FILTERS);
    const open: BrokerOrder[] = [];
    for (const entry of symbols) {
      if (!BINANCE_INSTRUMENT_FILTERS[entry]) {
        continue;
      }
      const response = await this.client.request<BinanceOrderQuery[]>("GET", "/api/v3/openOrders", {
        symbol: entry,
      });
      for (const item of response) {
        open.push(mapOrder(item, item.time, item.updateTime));
      }
    }
    return open;
  }

  async getPositions(symbol?: string): Promise<BrokerPosition[]> {
    const positions = mapPositions(await this.account());
    return symbol ? positions.filter((position) => position.symbol === symbol) : positions;
  }

  async getAccountState(): Promise<BrokerAccountState> {
    return mapAccountState(await this.account());
  }

  /** Binance spot order APIs are keyed by symbol + orderId (AGENTS.md §45). */
  private requireSymbol(method: string, options?: BrokerOrderIdentity): string {
    const symbol = options?.symbol?.trim();
    if (!symbol) {
      throw new BrokerError(
        `BinanceAdapter.${method} requires a symbol (spot order APIs are keyed by symbol).`,
      );
    }
    return symbol;
  }

  private async account(): Promise<BinanceAccountInfo> {
    return this.client.request<BinanceAccountInfo>("GET", "/api/v3/account", {});
  }

  private validateRequest(request: BrokerOrderRequest): void {
    if (!request.symbol) {
      throw new InvalidOrderRequestError("Symbol is required.");
    }
    if (!BINANCE_INSTRUMENT_FILTERS[request.symbol]) {
      throw new InvalidOrderRequestError(
        `Symbol "${request.symbol}" has no instrument filter configured.`,
      );
    }
    if (!request.clientOrderId) {
      throw new InvalidOrderRequestError("clientOrderId is required (idempotency).");
    }
    if (request.clientOrderId.length > MAX_CLIENT_ORDER_ID_LENGTH) {
      throw new InvalidOrderRequestError(
        `clientOrderId must be at most ${MAX_CLIENT_ORDER_ID_LENGTH} characters.`,
      );
    }
    if (request.stopLoss !== undefined || request.takeProfit !== undefined) {
      // The entry itself never carries SL/TP legs on spot; the protective
      // bracket is placed separately after the entry fills
      // (attachProtectiveBracket). Only market buy entries may express that
      // intent: a sell-side close cannot be bracketed on spot yet, and a limit
      // entry stays open (and so cannot be bracketed immediately). Both are
      // refused fail-closed rather than silently trading unprotected.
      if (request.type === "limit") {
        throw new InvalidOrderRequestError(
          "Limit entries with stopLoss/takeProfit are refused: Binance spot protects a " +
            "position only after a fill, and a resting limit has not filled yet.",
        );
      }
      if (request.side === "sell") {
        throw new InvalidOrderRequestError(
          "Binance spot sells are reduce-only closes; stopLoss/takeProfit on a sell is not supported.",
        );
      }
    }
    if (request.reduceOnly && request.side === "buy") {
      throw new InvalidOrderRequestError(
        "Reduce-only buys are not possible on Binance spot (no short side); " +
          "refusing the intent.",
      );
    }
  }
}
