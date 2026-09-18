import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer.js';

/** Broker order lifecycle statuses (AGENTS.md §15). */
export type PaperOrderStatus =
  | 'CREATED'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'FAILED';

/** Paper account states. */
export type PaperAccountStatus = 'ACTIVE' | 'STOPPED' | 'CLOSED';

/**
 * A user-owned simulated account. Postgres is the source of truth for cash,
 * realized P&L and fees; the PaperBroker is rehydrated from these fields.
 */
@Entity('paper_accounts')
@Unique('uq_paper_accounts_user_name', ['userId', 'name'])
export class PaperAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'name', type: 'varchar', length: 64 })
  name: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' })
  status: PaperAccountStatus;

  @Column({
    name: 'starting_cash',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  startingCash: string;

  @Column({
    name: 'free_cash',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  freeCash: string;

  @Column({
    name: 'realized_pnl',
    type: 'numeric',
    precision: 40,
    scale: 20,
    default: '0',
    transformer: decimalTransformer,
  })
  realizedPnl: string;

  @Column({
    name: 'total_fees_paid',
    type: 'numeric',
    precision: 40,
    scale: 20,
    default: '0',
    transformer: decimalTransformer,
  })
  totalFeesPaid: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt: Date;
}

/**
 * Every paper order intent, with its lifecycle status and final execution
 * details. `account_id + client_order_id` is unique so a retried request can
 * never create a duplicate order (AGENTS.md §16).
 */
@Entity('paper_orders')
@Unique('uq_paper_orders_account_client', ['accountId', 'clientOrderId'])
@Index('idx_paper_orders_account_status', ['accountId', 'status'])
export class PaperOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'client_order_id', type: 'varchar', length: 64 })
  clientOrderId: string;

  @Column({
    name: 'broker_order_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  brokerOrderId: string | null;

  /** Executing provider ('paper' by default; a live provider for live bots). */
  @Column({ name: 'provider', type: 'varchar', length: 16, default: 'paper' })
  provider: string;

  /** Latest broker-reported order status for reconciliation (AGENTS.md §17). */
  @Column({
    name: 'broker_status',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  brokerStatus: string | null;

  /** When the local row last matched broker state (reconciliation timestamp). */
  @Column({
    name: 'last_synced_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastSyncedAt: Date | null;

  @Column({ name: 'side', type: 'varchar', length: 8 })
  side: 'buy' | 'sell';

  @Column({ name: 'type', type: 'varchar', length: 16 })
  type: 'market' | 'limit';

  @Column({ name: 'symbol', type: 'varchar', length: 32 })
  symbol: string;

  @Column({
    name: 'quantity',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  quantity: string;

  @Column({
    name: 'price',
    type: 'numeric',
    precision: 40,
    scale: 20,
    nullable: true,
    transformer: decimalTransformer,
  })
  price: string | null;

  @Column({
    name: 'stop_loss',
    type: 'numeric',
    precision: 40,
    scale: 20,
    nullable: true,
    transformer: decimalTransformer,
  })
  stopLoss: string | null;

  @Column({
    name: 'take_profit',
    type: 'numeric',
    precision: 40,
    scale: 20,
    nullable: true,
    transformer: decimalTransformer,
  })
  takeProfit: string | null;

  @Column({ name: 'reduce_only', type: 'boolean', default: false })
  reduceOnly: boolean;

  @Column({
    name: 'fee_rate',
    type: 'numeric',
    precision: 40,
    scale: 20,
    default: '0',
    transformer: decimalTransformer,
  })
  feeRate: string;

  @Column({
    name: 'slippage_rate',
    type: 'numeric',
    precision: 40,
    scale: 20,
    default: '0',
    transformer: decimalTransformer,
  })
  slippageRate: string;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status: PaperOrderStatus;

  @Column({
    name: 'filled_quantity',
    type: 'numeric',
    precision: 40,
    scale: 20,
    default: '0',
    transformer: decimalTransformer,
  })
  filledQuantity: string;

  @Column({
    name: 'avg_fill_price',
    type: 'numeric',
    precision: 40,
    scale: 20,
    nullable: true,
    transformer: decimalTransformer,
  })
  avgFillPrice: string | null;

  @Column({
    name: 'fees',
    type: 'numeric',
    precision: 40,
    scale: 20,
    default: '0',
    transformer: decimalTransformer,
  })
  fees: string;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt: Date;
}

/**
 * The current open position for one account+symbol. Kept in sync with the
 * ledger after every fill so Postgres remains the source of truth.
 */
@Entity('paper_positions')
@Unique('uq_paper_positions_account_symbol', ['accountId', 'symbol'])
export class PaperPositionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'symbol', type: 'varchar', length: 32 })
  symbol: string;

  @Column({ name: 'side', type: 'varchar', length: 8, default: 'long' })
  side: 'long' | 'short';

  @Column({
    name: 'quantity',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  quantity: string;

  @Column({
    name: 'avg_entry_price',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  avgEntryPrice: string;

  @Column({
    name: 'fees',
    type: 'numeric',
    precision: 40,
    scale: 20,
    default: '0',
    transformer: decimalTransformer,
  })
  fees: string;

  @Column({
    name: 'realized_pnl',
    type: 'numeric',
    precision: 40,
    scale: 20,
    default: '0',
    transformer: decimalTransformer,
  })
  realizedPnl: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt: Date;
}

/**
 * Immutable point-in-time equity snapshot. Writted after significant ledger
 * changes so portfolio history can be rebuilt without replaying candles.
 */
@Entity('paper_portfolio_snapshots')
@Index('idx_paper_portfolio_snapshots_account_created', [
  'accountId',
  'createdAt',
])
export class PaperPortfolioSnapshotEntity {
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
