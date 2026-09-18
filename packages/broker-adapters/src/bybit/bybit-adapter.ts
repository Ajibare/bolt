import type {
  BrokerAccountState,
  BrokerAdapter,
  BrokerOrder,
  BrokerOrderIdentity,
  BrokerOrderRequest,
  BrokerPosition,
} from "../broker.interface.js";
import { BrokerError, InvalidOrderRequestError } from "../errors.js";
import { BybitHttpClient } from "./http-client.js";
import {
  buildQueryString,
  mapOrderItem,
  mapOrderSide,
  mapPosition,
  mapWallet,
  normalizeQuantity,
  roundToStep,
} from "./mappers.js";
import {
  BYBIT_BASE_URLS,
  BYBIT_INSTRUMENT_FILTERS,
  isBybitEnvironment,
  type BybitAdapterConfig,
  type BybitApiResponse,
  type BybitOrderListResult,
  type BybitPositionListResult,
  type BybitWalletResult,
} from "./types.js";

const CATEGORY = "linear";
const POSITION_IDX = 0;
const OPEN_STATUSES = new Set(["Created", "New", "PartiallyFilled"]);

/**
 * Live/demo broker adapter for Bybit v5 unified trading (AGENTS.md §11-12).
 *
 * - Only the Bybit wire format is handled here; the rest of Trading Bolt sees
 *   `BrokerAdapter`.
 * - `clientOrderId` maps to Bybit `orderLinkId`, giving callers an idempotency
 *   key (AGENTS.md §16).
 * - The adapter never guesses fill state: a fresh market order is returned as
 *   SUBMITTED and converges to its real status through reconciliation.
 * - Halts the constructor when credentials are missing (fail-closed, §20).
 */
export class BybitAdapter implements BrokerAdapter {
  readonly name = "bybit";

  private readonly client: BybitHttpClient;

  constructor(config: BybitAdapterConfig) {
    const apiKey = (config.apiKey ?? "").trim();
    const apiSecret = (config.apiSecret ?? "").trim();
    if (!apiKey || !apiSecret) {
      throw new BrokerError("BybitAdapter requires apiKey and apiSecret (fail-closed).");
    }
    const environment = config.environment ?? "demo";
    if (!isBybitEnvironment(environment)) {
      throw new BrokerError(`Unknown Bybit environment: ${JSON.stringify(environment)}`);
    }
    this.client = new BybitHttpClient({
      baseUrl: config.baseUrl ?? BYBIT_BASE_URLS[environment],
      apiKey,
      apiSecret,
      recvWindow: config.recvWindow ?? 5000,
      fetchImpl: config.fetchImpl ?? fetch,
    });
  }

  async placeOrder(request: BrokerOrderRequest): Promise<BrokerOrder> {
    this.validateRequest(request);
    const qtyStep = BYBIT_INSTRUMENT_FILTERS[request.symbol];
    const quantity = normalizeQuantity(request.quantity, qtyStep.qtyStep, request.symbol);
    const payload: Record<string, string> = {
      category: CATEGORY,
      symbol: request.symbol,
      side: mapOrderSide(request.side),
      orderType: request.type === "limit" ? "Limit" : "Market",
      qty: quantity,
      timeInForce: request.type === "limit" ? "Gtc" : "Ioc",
      orderLinkId: request.clientOrderId,
    };
    if (request.type === "limit") {
      if (!request.price) {
        throw new InvalidOrderRequestError("Limit orders require a price.");
      }
      payload.price = roundToStep(request.price, qtyStep.tickSize);
    }
    if (request.stopLoss) {
      payload.stopLoss = String(request.stopLoss);
    }
    if (request.takeProfit) {
      payload.takeProfit = String(request.takeProfit);
    }
    if (request.reduceOnly) {
      payload.reduceOnly = "true";
    }
    payload.positionIdx = String(POSITION_IDX);

    const response = await this.client.request<
      BybitApiResponse<{ orderId: string; orderLinkId: string }>
    >({
      method: "POST",
      path: "/v5/order/create",
      body: JSON.stringify(payload),
    });

    if (!response.result.orderId) {
      throw new BrokerError("Bybit accepted the order without returning an orderId.");
    }
    const now = Date.now();
    return {
      id: response.result.orderId,
      clientOrderId: response.result.orderLinkId || request.clientOrderId,
      side: request.side,
      type: request.type,
      symbol: request.symbol,
      quantity,
      price: request.price ? roundToStep(request.price, qtyStep.tickSize) : undefined,
      stopLoss: request.stopLoss,
      takeProfit: request.takeProfit,
      reduceOnly: request.reduceOnly ?? false,
      status: "SUBMITTED",
      avgFillPrice: null,
      filledQuantity: "0",
      fees: "0",
      createdAt: now,
      updatedAt: now,
    };
  }

  async cancelOrder(orderId: string, _options?: BrokerOrderIdentity): Promise<void> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new BrokerError(`Cannot cancel unknown order "${orderId}"`);
    }
    const query = JSON.stringify({
      category: CATEGORY,
      symbol: order.symbol,
      orderId,
    });
    await this.client.request<BybitApiResponse<{ orderId: string }>>({
      method: "POST",
      path: "/v5/order/cancel",
      body: query,
    });
  }

  async getOrder(orderId: string, _options?: BrokerOrderIdentity): Promise<BrokerOrder | null> {
    const response = await this.client.request<BybitApiResponse<BybitOrderListResult>>({
      method: "GET",
      path: "/v5/order/realtime",
      query: buildQueryString({ category: CATEGORY, orderId }),
    });
    const item = response.result.list?.[0];
    return item ? mapOrderItem(item) : null;
  }

  async getOpenOrders(symbol?: string): Promise<BrokerOrder[]> {
    const response = await this.client.request<BybitApiResponse<BybitOrderListResult>>({
      method: "GET",
      path: "/v5/order/realtime",
      query: buildQueryString({
        category: CATEGORY,
        ...(symbol ? { symbol } : {}),
      }),
    });
    const openOrders: BrokerOrder[] = [];
    for (const item of response.result.list ?? []) {
      if (OPEN_STATUSES.has(item.orderStatus)) {
        openOrders.push(mapOrderItem(item));
      }
    }
    return openOrders;
  }

  async getPositions(symbol?: string): Promise<BrokerPosition[]> {
    const response = await this.client.request<BybitApiResponse<BybitPositionListResult>>({
      method: "GET",
      path: "/v5/position/list",
      query: buildQueryString({
        category: CATEGORY,
        ...(symbol ? { symbol } : {}),
      }),
    });
    const positions: BrokerPosition[] = [];
    for (const item of response.result.list ?? []) {
      if (Number(item.size) !== 0) {
        positions.push(mapPosition(item));
      }
    }
    return positions;
  }

  async getAccountState(): Promise<BrokerAccountState> {
    const response = await this.client.request<BybitApiResponse<BybitWalletResult>>({
      method: "GET",
      path: "/v5/account/wallet-balance",
      query: buildQueryString({ accountType: "UNIFIED" }),
    });
    return mapWallet(response.result.list?.[0]?.coin ?? []);
  }

  private validateRequest(request: BrokerOrderRequest): void {
    if (!request.symbol) {
      throw new InvalidOrderRequestError("Symbol is required.");
    }
    if (!BYBIT_INSTRUMENT_FILTERS[request.symbol]) {
      throw new InvalidOrderRequestError(
        `Symbol "${request.symbol}" has no instrument filter configured.`,
      );
    }
    if (!request.clientOrderId) {
      throw new InvalidOrderRequestError("clientOrderId is required (idempotency).");
    }
  }
}
