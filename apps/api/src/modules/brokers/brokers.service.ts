import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BinanceAdapter, BybitAdapter } from '@trading-bolt/broker-adapters';

export type BrokerEnvironment = 'paper' | 'demo' | 'testnet' | 'mainnet';
export type LiveBrokerProvider = 'binance' | 'bybit';

export interface BrokerExecutorInfo {
  /** Adapter/protocol name. */
  provider: LiveBrokerProvider | 'paper';
  /** Execution mode the bot engine maps this broker to (AGENTS.md §11). */
  mode: 'PAPER' | 'LIVE';
  /** Where execution happens — 'paper' or a provider environment. */
  environment: BrokerEnvironment;
  /** true when a real adapter is configured and usable right now. */
  available: boolean;
}

/**
 * Environment-backed broker registry (AGENTS.md §11-12/§20).
 *
 * Paper is always available. One live provider is the ACTIVE broker for the
 * whole deployment: Binance when a `BINANCE_*` credential pair is present
 * (the primary development exchange, defaulting to Testnet), else Bybit when
 * `BYBIT_*` is present. Adapters are only constructed when a full credential
 * pair exists in env; partial pairs are refused at boot by `env.validation.ts`
 * (fail-closed). Credentials are read from env only and never leave this
 * service.
 */
@Injectable()
export class BrokersService {
  private readonly logger = new Logger(BrokersService.name);
  private binance: BinanceAdapter | null = null;
  private bybit: BybitAdapter | null = null;

  constructor(private readonly config: ConfigService) {}

  listExecutors(): BrokerExecutorInfo[] {
    return [
      {
        provider: 'paper',
        mode: 'PAPER',
        environment: 'paper',
        available: true,
      },
      {
        provider: 'binance',
        mode: 'LIVE',
        environment: this.binanceEnvironment(),
        available: this.isBinanceConfigured(),
      },
      {
        provider: 'bybit',
        mode: 'LIVE',
        environment: this.bybitEnvironment(),
        available: this.isBybitConfigured(),
      },
    ];
  }

  /**
   * The active live provider: Binance when configured (primary), else Bybit,
   * else null. Deterministic so a deployment never routes through two brokers.
   */
  provider(): LiveBrokerProvider | null {
    if (this.isBinanceConfigured()) {
      return 'binance';
    }
    if (this.isBybitConfigured()) {
      return 'bybit';
    }
    return null;
  }

  /** True when a live credential pair (either provider) is configured. */
  isLiveConfigured(): boolean {
    return this.provider() !== null;
  }

  /**
   * Returns the lazily-constructed adapter for the active live provider, or
   * null when no live credentials are configured. Never logs or exposes a
   * secret.
   */
  getLiveAdapter(): BinanceAdapter | BybitAdapter | null {
    const provider = this.provider();
    if (provider === 'binance') {
      return this.binanceAdapter();
    }
    if (provider === 'bybit') {
      return this.bybitAdapter();
    }
    return null;
  }

  /**
   * Execution environment of the active provider, used for bot mode-matching.
   * With no live provider configured it reports the primary development target
   * (Binance Testnet) so the UI monitor is still informative.
   */
  environment(): 'demo' | 'testnet' | 'mainnet' {
    const provider = this.provider();
    if (provider === 'binance') {
      return this.binanceEnvironment();
    }
    if (provider === 'bybit') {
      return this.bybitEnvironment();
    }
    return this.binanceEnvironment();
  }

  private binanceAdapter(): BinanceAdapter | null {
    if (!this.isBinanceConfigured()) {
      return null;
    }
    if (this.binance === null) {
      this.binance = new BinanceAdapter({
        apiKey: this.config.getOrThrow<string>('BINANCE_API_KEY'),
        apiSecret: this.config.getOrThrow<string>('BINANCE_API_SECRET'),
        environment: this.binanceEnvironment(),
      });
      this.logger.log('BROKER_CONFIGURED', {
        provider: 'binance',
        environment: this.binanceEnvironment(),
      });
    }
    return this.binance;
  }

  private bybitAdapter(): BybitAdapter | null {
    if (!this.isBybitConfigured()) {
      return null;
    }
    if (this.bybit === null) {
      this.bybit = new BybitAdapter({
        apiKey: this.config.getOrThrow<string>('BYBIT_API_KEY'),
        apiSecret: this.config.getOrThrow<string>('BYBIT_API_SECRET'),
        environment: this.bybitEnvironment(),
      });
      this.logger.log('BROKER_CONFIGURED', {
        provider: 'bybit',
        environment: this.bybitEnvironment(),
      });
    }
    return this.bybit;
  }

  private isBinanceConfigured(): boolean {
    return (
      this.config.get<string>('BINANCE_API_KEY', '')?.trim().length > 0 &&
      this.config.get<string>('BINANCE_API_SECRET', '')?.trim().length > 0
    );
  }

  private isBybitConfigured(): boolean {
    return (
      this.config.get<string>('BYBIT_API_KEY', '')?.trim().length > 0 &&
      this.config.get<string>('BYBIT_API_SECRET', '')?.trim().length > 0
    );
  }

  private binanceEnvironment(): 'testnet' | 'mainnet' {
    return this.config.get<'testnet' | 'mainnet'>('BINANCE_ENV', 'testnet');
  }

  private bybitEnvironment(): 'demo' | 'testnet' | 'mainnet' {
    return this.config.get<'demo' | 'testnet' | 'mainnet'>(
      'BYBIT_ENVIRONMENT',
      'demo',
    );
  }
}
