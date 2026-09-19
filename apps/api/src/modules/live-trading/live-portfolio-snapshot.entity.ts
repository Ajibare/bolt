import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer.js';

/**
 * Immutable live-broker portfolio snapshot (AGENTS.md §13). Written on a
 * periodic tick from the broker's point-in-time balance report, so a
 * live-account equity curve can be rebuilt exactly like the paper one.
 *
 * `equity` and `cash` are honest broker-observed sums. `positionValue` and
 * `realizedPnl` are not yet derivable from spot balances (they need a marking
 * oracle / realized-P&L tracking) and stay `'0'` — the equity curve only reads
 * `equity`, so the analytics never depend on fabricated values.
 */
@Entity('live_portfolio_snapshots')
export class LivePortfolioSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({
    name: 'equity',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  equity: string;

  @Column({
    name: 'cash',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  cash: string;

  @Column({
    name: 'position_value',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  positionValue: string;

  @Column({
    name: 'realized_pnl',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  realizedPnl: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;
}
