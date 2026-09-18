/**
 * Binance Testnet smoke test — proves the entire signed live path against the
 * real exchange (AGENTS.md §11/§14/§17/§45) using a small live trade:
 *
 *   account state -> market buy entry -> OCO protective bracket
 *     -> fill-fee reconciliation (myTrades) -> cancel bracket -> flatten
 *
 * Credentials come from BINANCE_API_KEY / BINANCE_API_SECRET (shell or .env —
 * never committed). Refuses mainnet unless SMOKE_ALLOW_MAINNET=1.
 *
 * Usage (packages must be built first: `pnpm -w build`):
 *   pnpm --filter api smoke:binance -- --symbol BTCUSDT --notional 10
 *   pnpm --filter api smoke:binance -- --dry-run         (connectivity only)
 *   pnpm --filter api smoke:binance -- --leave           (keep bracket+position)
 *
 * The script is intentionally adapter-level: it drives the BrokerAdapter the
 * same way the API's LiveTradingService does, so it validates the real broker
 * integration without needing a database. Cleanup is best-effort and always
 * loud about anything it could not unwind.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  BinanceAdapter,
  BINANCE_BASE_ASSET,
  BINANCE_BASE_URLS,
  BrokerError,
  type BrokerOrder,
} from '@trading-bolt/broker-adapters';
import { toDecimal } from '@trading-bolt/shared';
import { SUPPORTED_SYMBOLS, isSupportedSymbol } from '@trading-bolt/shared';

const ROOT_ENV = fileURLToPath(new URL('../../../.env', import.meta.url));
const API_ENV = fileURLToPath(new URL('../../.env', import.meta.url));

interface Options {
  symbol: string;
  notional: number;
  slPct: number;
  tpPct: number;
  leave: boolean;
  dryRun: boolean;
  allowMainnet: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    symbol: 'BTCUSDT',
    notional: 10,
    slPct: 5,
    tpPct: 6,
    leave: false,
    dryRun: false,
    allowMainnet: process.env.SMOKE_ALLOW_MAINNET === '1',
  };
  const value = (flag: string): string | undefined => {
    const inline = argv.find((arg) => arg.startsWith(`--${flag}=`));
    return inline ? inline.slice(flag.length + 3) : undefined;
  };
  const positional = (flag: string): string | undefined => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const has = (flag: string): boolean => argv.includes(`--${flag}`);

  const symbol = value('symbol') ?? positional('symbol');
  if (symbol) {
    options.symbol = symbol;
  }
  const notional = Number(
    value('notional') ?? positional('notional') ?? options.notional,
  );
  if (!Number.isFinite(notional) || notional <= 0) {
    throw new Error('--notional must be a positive number.');
  }
  options.notional = notional;
  const slPct = Number(
    value('sl-pct') ?? positional('sl-pct') ?? options.slPct,
  );
  const tpPct = Number(
    value('tp-pct') ?? positional('tp-pct') ?? options.tpPct,
  );
  if (
    !Number.isFinite(slPct) ||
    slPct <= 0 ||
    !Number.isFinite(tpPct) ||
    tpPct <= 0
  ) {
    throw new Error('--sl-pct and --tp-pct must be positive percentages.');
  }
  options.slPct = slPct;
  options.tpPct = tpPct;
  options.leave = has('leave');
  options.dryRun = has('dry-run');
  options.allowMainnet = options.allowMainnet || has('allow-mainnet');
  if (!isSupportedSymbol(options.symbol)) {
    throw new Error(
      `Unsupported symbol ${options.symbol}. Supported: ${SUPPORTED_SYMBOLS.join(', ')}`,
    );
  }
  return options;
}

function loadEnv(): string[] {
  const candidates = [path.resolve('.env'), ROOT_ENV, API_ENV].filter(
    existsSync,
  );
  const loaded: string[] = [];
  for (const candidate of candidates) {
    const result = dotenv.config({ path: candidate });
    if (!result.error) {
      loaded.push(candidate);
    }
  }
  return loaded;
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    console.log(`  [ok] ${name}`);
    return result;
  } catch (error) {
    console.error(`  [FAIL] ${name}: ${(error as Error).message}`);
    throw error;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing ${name} (set it in .env or the shell).`);
  }
  return value.trim();
}

async function fetchSpotPrice(
  baseUrl: string,
  symbol: string,
): Promise<string> {
  const response = await fetch(
    `${baseUrl}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
  );
  if (!response.ok) {
    throw new Error(`ticker/price failed (HTTP ${response.status}).`);
  }
  const body = (await response.json()) as { price?: string };
  if (!body.price) {
    throw new Error('ticker/price returned no price.');
  }
  return body.price;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFill(
  adapter: BinanceAdapter,
  order: BrokerOrder,
): Promise<BrokerOrder> {
  if (order.status === 'FILLED') {
    return order;
  }
  if (order.status === 'REJECTED' || order.status === 'FAILED') {
    throw new Error(
      `Entry failed with status ${order.status}: ${order.reason ?? 'no reason'}`,
    );
  }
  let current = order;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(1500);
    const remote = await adapter.getOrder(order.id, { symbol: order.symbol });
    if (!remote) {
      throw new Error(
        'Entry disappeared at the broker while waiting for the fill.',
      );
    }
    current = remote;
    if (remote.status === 'FILLED') {
      return remote;
    }
    if (remote.status === 'REJECTED' || remote.status === 'FAILED') {
      throw new Error(
        `Entry failed with status ${remote.status}: ${remote.reason ?? 'no reason'}`,
      );
    }
  }
  throw new Error(`Entry did not fill within 15s (status ${current.status}).`);
}

async function cancelOpenOrders(
  adapter: BinanceAdapter,
  symbol: string,
): Promise<number> {
  const open = await adapter.getOpenOrders(symbol);
  for (const openOrder of open) {
    await adapter.cancelOrder(openOrder.id, { symbol });
    console.log(
      `  [info] cancelled open order ${openOrder.id} (${openOrder.side}/${openOrder.type})`,
    );
  }
  return open.length;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const envFiles = loadEnv();
  console.log(
    envFiles.length > 0
      ? `[smoke] loaded env from ${envFiles.join(', ')}`
      : '[smoke] no .env found; using shell environment.',
  );

  const apiKey = requireEnv('BINANCE_API_KEY');
  const apiSecret = requireEnv('BINANCE_API_SECRET');
  const rawEnvironment = (process.env.BINANCE_ENV ?? 'testnet')
    .trim()
    .toLowerCase();
  if (!['testnet', 'mainnet'].includes(rawEnvironment)) {
    throw new Error(
      `Unknown BINANCE_ENV "${rawEnvironment}". Use "testnet" or "mainnet".`,
    );
  }
  // BINANCE_ENV is validated above; the type is narrowed deliberately.
  const environment = rawEnvironment as 'testnet' | 'mainnet';
  if (environment === 'mainnet' && !options.allowMainnet) {
    throw new Error(
      'Refusing to run against a mainnet account. Set SMOKE_ALLOW_MAINNET=1 (or pass --allow-mainnet) only if you truly mean it — a real trade is placed.',
    );
  }

  const adapter = new BinanceAdapter({
    apiKey,
    apiSecret,
    environment,
    recvWindow: 10000,
  });
  const baseUrl = BINANCE_BASE_URLS[environment as 'testnet' | 'mainnet'];
  console.log(
    `[smoke] environment=${environment} symbol=${options.symbol} notional=${options.notional}`,
  );

  if (options.dryRun) {
    await step('connectivity and credentials', async () => {
      const state = await adapter.getAccountState();
      const balances = state.balances
        .slice(0, 5)
        .map((balance) => `${balance.asset}=${balance.total}`)
        .join(', ');
      console.log(`  [info] account balances (first 5): ${balances}`);
    });
    console.log('[smoke] PASS (dry-run)');
    return 0;
  }

  const baseAsset = BINANCE_BASE_ASSET[options.symbol];
  const quoteAsset = options.symbol.slice(baseAsset.length);
  const entryKey = `smoke-${Date.now().toString(36)}`;
  let filledQuantity = '';

  // 1. Confirm the quote-asset balance covers the notional.
  await step('account balance check', async () => {
    const state = await adapter.getAccountState();
    const balance = state.balances.find((entry) => entry.asset === quoteAsset);
    if (!balance || toDecimal(balance.free).lt(toDecimal(options.notional))) {
      throw new Error(
        `Account has insufficient free ${quoteAsset} (${balance?.free ?? '0'}) for a ${options.notional} ${quoteAsset} notional.`,
      );
    }
    console.log(`  [info] free ${quoteAsset}=${balance.free}`);
  });

  // 2. Price discovery (public, unsigned) so the notional becomes a quantity.
  const price = await step('price discovery', async () =>
    fetchSpotPrice(baseUrl, options.symbol),
  );
  const quantity = toDecimal(options.notional)
    .div(toDecimal(price))
    .toDecimalPlaces(8)
    .toString();
  console.log(
    `  [info] price=${price} raw quantity~${quantity} (floored to lot by the adapter)`,
  );

  // 3. Market buy entry.
  const entry = await step('market buy entry', async () =>
    adapter.placeOrder({
      side: 'buy',
      type: 'market',
      symbol: options.symbol,
      quantity,
      clientOrderId: entryKey,
    }),
  );
  const filled = await step('wait for fill', async () =>
    waitForFill(adapter, entry),
  );
  const avgPrice = filled.avgFillPrice ?? entry.avgFillPrice ?? entry.price;
  if (!avgPrice) {
    throw new Error(
      'Filled entry has no average fill price — cannot size the bracket.',
    );
  }
  filledQuantity = filled.filledQuantity.toString();
  console.log(
    `  [info] entry filled ${filledQuantity} @ ${avgPrice} (orderId=${filled.id})`,
  );

  // 4. OCO protective bracket around the fill (SL below, TP above).
  const sl = toDecimal(avgPrice).times(
    toDecimal(1).minus(toDecimal(options.slPct).div(100)),
  );
  const tp = toDecimal(avgPrice).times(
    toDecimal(1).plus(toDecimal(options.tpPct).div(100)),
  );
  const bracket = await step('attach OCO protective bracket', async () =>
    adapter.attachProtectiveBracket({
      entryOrderId: filled.id,
      symbol: options.symbol,
      quantity: filledQuantity,
      stopLoss: sl.toString(),
      takeProfit: tp.toString(),
      idempotencyKey: `${filled.id}-oco`.slice(0, 36),
    }),
  );
  console.log(`  [info] bracket orderListId=${bracket.bracketOrderListId}`);

  // 5. Reconciliation view: getOrder triggers the myTrades fee sweep.
  const reconciled = await step('reconcile fees (myTrades sweep)', async () =>
    adapter.getOrder(filled.id, { symbol: options.symbol }),
  );
  if (reconciled && toDecimal(reconciled.fees).gt(0)) {
    console.log(`  [info] cumulative fees=${reconciled.fees} (quote asset)`);
  } else {
    console.warn(
      '[warn] accumulated fees are 0 — either the myTrades sweep returned nothing, the fill used BNB/base commissions, or the sweep failed. Cross-check broker statements for the truth.',
    );
  }

  if (options.leave) {
    console.log(
      '[smoke] PASS (position + bracket kept; flatten manually when done)',
    );
    return 0;
  }

  // 6. Cleanup: cancel the bracket legs, then flatten the position.
  let failed = false;
  try {
    const cancelled = await step('cancel protective bracket legs', async () =>
      cancelOpenOrders(adapter, options.symbol),
    );
    if (cancelled > 0) {
      console.log(`  [info] cancelled ${cancelled} open order(s)`);
    }
  } catch (error) {
    console.error(
      `[error] could not cancel bracket legs: ${(error as Error).message}`,
    );
    failed = true;
  }

  if (!failed) {
    try {
      const sell = await step('flatten position (market sell)', async () =>
        adapter.placeOrder({
          side: 'sell',
          type: 'market',
          symbol: options.symbol,
          quantity: filledQuantity,
          clientOrderId: `${entryKey}-sell`.slice(0, 36),
        }),
      );
      console.log(`  [info] flattened ${sell.filledQuantity} (${sell.status})`);
    } catch (error) {
      console.error(`[error] flattening failed: ${(error as Error).message}`);
      failed = true;
    }
  }

  if (failed) {
    console.error(
      '[error] the position/bracket may still be open at the broker. Manually cancel open orders and flatten before continuing. DO NOT re-run this script blindly — idempotency keys are unique per run, so a retry would place a NEW trade (AGENTS.md §16).',
    );
    return 2;
  }

  console.log('[smoke] PASS');
  return 0;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const message =
      error instanceof BrokerError ? error.message : (error as Error).message;
    console.error(`[smoke] FAIL: ${message}`);
    process.exitCode = 1;
  });
