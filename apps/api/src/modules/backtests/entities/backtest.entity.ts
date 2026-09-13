import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer.js';

@Entity('backtests')
export class BacktestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'strategy_id', type: 'varchar', length: 128 })
  strategyId: string;

  @Column({ name: 'config', type: 'jsonb', default: '{}' })
  config: Record<string, unknown>;

  @Column({ name: 'symbol', type: 'varchar', length: 32 })
  symbol: string;

  @Column({ name: 'interval', type: 'varchar', length: 8 })
  interval: string;

  @Column({ name: 'candle_limit', type: 'int' })
  candleLimit: number;

  @Column({
    name: 'starting_balance',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  startingBalance: string;

  @Column({
    name: 'fee_rate',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  feeRate: string;

  @Column({
    name: 'slippage_rate',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  slippageRate: string;

  @Column({
    name: 'position_size',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  positionSize: string;

  @Column({ name: 'allow_short', type: 'boolean', default: false })
  allowShort: boolean;

  @Column({
    name: 'risk_free_rate',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  riskFreeRate: string;

  @Column({
    name: 'net_profit',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  netProfit: string;

  @Column({
    name: 'ending_balance',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  endingBalance: string;

  @Column({
    name: 'total_return',
    type: 'numeric',
    precision: 16,
    scale: 10,
  })
  totalReturn: number;

  @Column({
    name: 'total_fees_paid',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  totalFeesPaid: string;

  @Column({ name: 'closed_trades', type: 'int', default: 0 })
  closedTrades: number;

  @Column({ name: 'winning_trades', type: 'int', default: 0 })
  winningTrades: number;

  @Column({ name: 'losing_trades', type: 'int', default: 0 })
  losingTrades: number;

  @Column({ name: 'win_rate', type: 'numeric', precision: 8, scale: 6 })
  winRate: number;

  @Column({ name: 'max_drawdown', type: 'numeric', precision: 8, scale: 6 })
  maxDrawdown: number;

  @Column({
    name: 'profit_factor',
    type: 'numeric',
    precision: 16,
    scale: 8,
    nullable: true,
  })
  profitFactor: number | null;

  @Column({
    name: 'sharpe',
    type: 'numeric',
    precision: 16,
    scale: 8,
    nullable: true,
  })
  sharpe: number | null;

  @OneToMany(() => BacktestTradeEntity, (trade) => trade.backtest, {
    cascade: true,
  })
  trades: BacktestTradeEntity[];

  @OneToMany(() => BacktestEquityPointEntity, (point) => point.backtest, {
    cascade: true,
  })
  equityPoints: BacktestEquityPointEntity[];

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

@Entity('backtest_trades')
export class BacktestTradeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'backtest_id', type: 'uuid' })
  backtestId: string;

  @ManyToOne(() => BacktestEntity, (backtest) => backtest.trades, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'backtest_id' })
  backtest: BacktestEntity;

  @Column({ name: 'seq', type: 'int' })
  seq: number;

  @Column({ name: 'side', type: 'varchar', length: 8 })
  side: 'buy' | 'sell';

  @Column({
    name: 'timestamp',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  timestamp: number;

  @Column({
    name: 'price',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  price: string;

  @Column({
    name: 'quantity',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  quantity: string;

  @Column({
    name: 'fee',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  fee: string;

  @Column({
    name: 'realized_pnl',
    type: 'numeric',
    precision: 40,
    scale: 20,
    nullable: true,
    transformer: decimalTransformer,
  })
  realizedPnl: string | null;
}

@Entity('backtest_equity_points')
export class BacktestEquityPointEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'backtest_id', type: 'uuid' })
  backtestId: string;

  @ManyToOne(() => BacktestEntity, (backtest) => backtest.equityPoints, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'backtest_id' })
  backtest: BacktestEntity;

  @Column({ name: 'seq', type: 'int' })
  seq: number;

  @Column({
    name: 'timestamp',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  timestamp: number;

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
    name: 'equity',
    type: 'numeric',
    precision: 40,
    scale: 20,
    transformer: decimalTransformer,
  })
  equity: string;
}
