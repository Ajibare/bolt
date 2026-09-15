import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Persisted circuit breaker (AGENTS.md §19). A row means the breaker is OPEN
 * with the given `severity` scope; deleting the row resets it. Persistence
 * guarantees a tripped breaker survives a process restart and never
 * auto-resumes silently.
 */
@Entity('circuit_breakers')
export class CircuitBreakerEntity {
  /** Scope label: 'global' | `account:<id>` | `bot:<id>`. */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  severity!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'tripped_at', type: 'timestamptz' })
  trippedAt!: Date;
}
