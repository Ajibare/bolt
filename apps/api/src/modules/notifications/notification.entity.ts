import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * In-app notification (AGENTS.md §25). One row per important platform event,
 * persisted per user so the UI never depends on Redis as the source of truth
 * (AGENTS.md §13). `severity` drives the UI tone; `type` is the structured
 * event name (e.g. `BOT_STARTED`, `CIRCUIT_BREAKER_TRIGGERED`); `link` points
 * at the affected page. `readAt` is set at read time — unobserved rows are the
 * unread set.
 */
@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Structured event name — see AGENTS.md §25 logging events. */
  @Column({ name: 'type', type: 'varchar', length: 48 })
  type: string;

  @Column({ name: 'severity', type: 'varchar', length: 16 })
  severity: 'info' | 'warn' | 'error';

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'body', type: 'text' })
  body: string;

  @Column({ name: 'link', type: 'varchar', length: 512, nullable: true })
  link: string | null;

  @Column({
    name: 'read_at',
    type: 'timestamptz',
    nullable: true,
  })
  readAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;
}
