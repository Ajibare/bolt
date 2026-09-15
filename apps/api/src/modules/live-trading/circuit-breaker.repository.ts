import type { CircuitBreakerEntity } from './circuit-breaker.entity.js';

/**
 * Persistence port for circuit breakers (AGENTS.md §19). Keeps TypeORM out of
 * the service so breaker flow is testable with mocks, matching the paper/
 * reconciliation repository pattern.
 */
export abstract class CircuitBreakerRepository {
  abstract list(): Promise<CircuitBreakerEntity[]>;

  abstract save(breaker: CircuitBreakerEntity): Promise<CircuitBreakerEntity>;

  abstract deleteBySeverity(severity: string): Promise<void>;
}
