import type { CandleInterval } from '@trading-bolt/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const bigintToNumber = {
  to: (value?: number): string | undefined =>
    value === undefined ? undefined : String(value),
  from: (value?: string | number): number | undefined =>
    value === undefined ? undefined : Number(value),
};

/**
 * Persisted OHLCV candle. Prices are stored as Postgres `numeric` so they are
 * expressed as decimal strings (matching the provider contract) with no float
 * conversion. `timestamp` is a Unix epoch in milliseconds.
 *
 * Index decorators mirror the migration. `synchronize` is disabled; schema
 * changes happen only through migrations.
 */
@Entity('market_candles')
@Index('idx_market_candles_symbol_interval_timestamp', [
  'symbol',
  'interval',
  'timestamp',
])
@Index('idx_market_candles_timestamp', ['timestamp'])
export class MarketCandleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 32 })
  symbol: string;

  @Column({ length: 8 })
  interval: CandleInterval;

  @Column({
    type: 'bigint',
    transformer: bigintToNumber,
  })
  timestamp: number;

  @Column({ type: 'numeric', precision: 40, scale: 20 })
  open: string;

  @Column({ type: 'numeric', precision: 40, scale: 20 })
  high: string;

  @Column({ type: 'numeric', precision: 40, scale: 20 })
  low: string;

  @Column({ type: 'numeric', precision: 40, scale: 20 })
  close: string;

  @Column({ type: 'numeric', precision: 40, scale: 20 })
  volume: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
