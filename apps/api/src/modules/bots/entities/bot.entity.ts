import type { BotExecutionMode, BotStatus } from '@trading-bolt/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer.js';

/**
 * A configured strategy bindings for automated execution (Phase 7).
 *
 * A bot references a strategy by registry id with a validated config snapshot,
 * a market symbol + timeframe, a server-validated risk policy, and one owned
 * PAPER account. Executing it drives: candles -> strategy -> signal -> risk ->
 * order manager -> PaperBroker (AGENTS.md §9/§10/§11).
 */
@Entity('bots')
@Unique('uq_bots_user_name', ['userId', 'name'])
export class BotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'name', type: 'varchar', length: 64 })
  name: string;

  @Column({ name: 'strategy_id', type: 'varchar', length: 128 })
  strategyId: string;

  /** Validated strategy parameters (registry schema). */
  @Column({ name: 'config', type: 'jsonb', default: '{}' })
  config: Record<string, unknown>;

  @Column({ name: 'symbol', type: 'varchar', length: 32 })
  symbol: string;

  @Column({ name: 'interval', type: 'varchar', length: 8 })
  interval: string;

  /** Server-validated partial risk policy (AGENTS.md §18). */
  @Column({ name: 'risk_config', type: 'jsonb', default: '{}' })
  riskConfig: Record<string, unknown>;

  @Column({ name: 'paper_account_id', type: 'uuid' })
  paperAccountId: string;

  @Column({
    name: 'execution_mode',
    type: 'varchar',
    length: 8,
    default: 'PAPER',
  })
  executionMode: BotExecutionMode;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'DRAFT' })
  status: BotStatus;

  /** Order quantity for entry signals (fixed per signal, MVP). */
  @Column({
    name: 'quantity',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  quantity: string;

  /** Fractional stop below entry (e.g. "0.02" = 2%), buys only. */
  @Column({
    name: 'stop_loss_percent',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  stopLossPercent: string;

  /** Fractional take-profit above entry; null disables the take-profit. */
  @Column({
    name: 'take_profit_percent',
    type: 'numeric',
    precision: 40,
    scale: 20,
    nullable: true,
    transformer: decimalTransformer,
  })
  takeProfitPercent: string | null;

  @Column({
    name: 'last_signal_direction',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  lastSignalDirection: 'buy' | 'sell' | 'hold' | null;

  @Column({ name: 'last_signal_reason', type: 'text', nullable: true })
  lastSignalReason: string | null;

  @Column({ name: 'last_signal_at', type: 'timestamptz', nullable: true })
  lastSignalAt: Date | null;

  @Column({ name: 'last_order_id', type: 'uuid', nullable: true })
  lastOrderId: string | null;

  @Column({
    name: 'last_order_status',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  lastOrderStatus: string | null;

  @Column({
    name: 'last_order_symbol',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  lastOrderSymbol: string | null;

  /** Persistent error detail; null when the bot is healthy. */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

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
 * One bot execution session from a start command until its stop/error. Runs
 * keep the monitoring counters (cycles, orders, errors) that the dashboard
 * needs (roadmap §Bot Monitoring).
 */
@Entity('bot_runs')
@Index('idx_bot_runs_bot_status', ['botId', 'status'])
export class BotRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bot_id', type: 'uuid' })
  botId: string;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status: BotStatus;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  startedAt: Date;

  @Column({ name: 'stopped_at', type: 'timestamptz', nullable: true })
  stoppedAt: Date | null;

  @Column({ name: 'cycles_run', type: 'int', default: 0 })
  cyclesRun: number;

  @Column({ name: 'orders_placed', type: 'int', default: 0 })
  ordersPlaced: number;

  @Column({ name: 'orders_rejected', type: 'int', default: 0 })
  ordersRejected: number;

  @Column({ name: 'last_cycle_at', type: 'timestamptz', nullable: true })
  lastCycleAt: Date | null;

  @Column({ name: 'error', type: 'text', nullable: true })
  error: string | null;

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
 * Immutable per-cycle execution record for one bot run (AGENTS.md §13): which
 * signal the strategy produced, whether the risk engine accepted the resulting
 * order or rejected it, and any failure detail. This is the audit trail behind
 * the `bot_runs` counters (`cycles_run`, `orders_placed`, `orders_rejected`).
 */
@Entity('bot_run_cycles')
@Index('idx_bot_run_cycles_run_seq', ['runId', 'seq'])
export class BotRunCycleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  /** 1-based cycle sequence within the run. */
  @Column({ type: 'int' })
  seq: number;

  @Column({
    name: 'signal_direction',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  signalDirection: 'buy' | 'sell' | 'hold' | null;

  @Column({ name: 'signal_reason', type: 'text', nullable: true })
  signalReason: string | null;

  @Column({ name: 'signal_at', type: 'timestamptz', nullable: true })
  signalAt: Date | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({
    name: 'order_status',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  orderStatus: string | null;

  @Column({ name: 'order_side', type: 'varchar', length: 8, nullable: true })
  orderSide: string | null;

  @Column({ name: 'order_symbol', type: 'varchar', length: 32, nullable: true })
  orderSymbol: string | null;

  /** Set when the risk engine rejected the order (AGENTS.md §10). */
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  /** Set when the cycle failed unexpectedly (bot flips to ERROR). */
  @Column({ name: 'error', type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;
}
