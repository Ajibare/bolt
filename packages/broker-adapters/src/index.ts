export * from "./broker.interface.js";
export * from "./errors.js";
export * from "./paper/paper-execution.js";
export * from "./paper/order-lifecycle.js";
export * from "./paper/paper-math.js";
export * from "./paper/paper-broker.js";
export * from "./paper/types.js";
export * from "./bybit/bybit-adapter.js";
export * from "./bybit/http-client.js";
export * from "./bybit/mappers.js";
export * from "./bybit/types.js";

// The Binance provider shares several helper names with Bybit, so its public
// surface is re-exported explicitly to avoid ambiguous `export *`.
export * from "./binance/binance-adapter.js";
export {
  BinanceApiError,
  BINANCE_ENVIRONMENTS,
  BINANCE_BASE_URLS,
  BINANCE_INSTRUMENT_FILTERS,
  BINANCE_BASE_ASSET,
  isBinanceEnvironment,
  type BinanceEnvironment,
  type BinanceAdapterConfig,
  type BinanceAccountInfo,
  type BinanceOrderSide,
  type BinanceOrderType,
  type BinanceTimeInForce,
  type BinanceOrderStatus,
  type BinanceOrderResponse,
  type BinanceOrderQuery,
} from "./binance/types.js";
export { BinanceHttpClient, type BinanceHttpClientOptions } from "./binance/http-client.js";
export {
  buildSignatureQuery as buildBinanceSignatureQuery,
  mapOrderSide as mapBinanceOrderSide,
  mapOrderStatus as mapBinanceOrderStatus,
  mapOrder as mapBinanceOrder,
  mapAccountState as mapBinanceAccountState,
  mapPositions as mapBinancePositions,
  floorToStep as floorToBinanceStep,
  roundToStep as roundToBinanceStep,
  normalizeQuantity as normalizeBinanceQuantity,
} from "./binance/mappers.js";
