import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BybitAdapter } from '@trading-bolt/broker-adapters';

export type BrokerEnvironment = 'paper' | 'demo' | 'testnet' | 'mainnet';

export interface BrokerExecutorInfo {
  /** Adapter/protocol name. */
  provider: 'paper' | 'bybit';
  /** Execution mode the bot engine maps this broker to (AGENTS.md §11). */
  mode: 'PAPER' | 'LIVE';
  /** Where execution happens — 'paper' or a Bybit environment. */
  environment: BrokerEnvironment;
  /** true when a real adapter is configured and usable right now. */
  available: boolean;
}

/**
 * Environment-backed broker registry (AGENTS.md §11-12/§20).
 *
 * Paper is always available. The Bybit adapter is only constructed when a full
 * credential pair is present in env; a partial pair is refused at boot by
 * `env.validation.ts` (fail-closed). Credentials are read from env only and
 * never leave this service.
 */
@Injectable()
export class BrokersService {
  private readonly logger = new Logger(BrokersService.name);
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
        provider: 'bybit',
        mode: 'LIVE',
        environment: this.bybitEnvironment(),
        available: this.isLiveConfigured(),
      },
    ];
  }

  /** True when a Bybit credential pair is configured. */
  isLiveConfigured(): boolean {
    return (
      this.config.get<string>('BYBIT_API_KEY', '')?.trim().length > 0 &&
      this.config.get<string>('BYBIT_API_SECRET', '')?.trim().length > 0
    );
  }

  /**
   * Returns the lazily-constructed Bybit adapter, or null when credentials are
   * absent. Never logs or exposes the secret.
   */
  getBybitAdapter(): BybitAdapter | null {
    if (!this.isLiveConfigured()) {
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

  /** The configured Bybit execution environment used for mode-compatibility checks. */
  environment(): 'demo' | 'testnet' | 'mainnet' {
    return this.bybitEnvironment();
  }

  private bybitEnvironment(): 'demo' | 'testnet' | 'mainnet' {
    return this.config.get<'demo' | 'testnet' | 'mainnet'>(
      'BYBIT_ENVIRONMENT',
      'demo',
    );
  }
}
