import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CircuitBreakerEntity } from './circuit-breaker.entity.js';
import { CircuitBreakerRepository } from './circuit-breaker.repository.js';

@Injectable()
export class TypeOrmCircuitBreakerRepository extends CircuitBreakerRepository {
  constructor(
    @InjectRepository(CircuitBreakerEntity)
    private readonly repo: Repository<CircuitBreakerEntity>,
  ) {
    super();
  }

  list(): Promise<CircuitBreakerEntity[]> {
    return this.repo.find();
  }

  save(breaker: CircuitBreakerEntity): Promise<CircuitBreakerEntity> {
    return this.repo.save(breaker);
  }

  async deleteBySeverity(severity: string): Promise<void> {
    await this.repo.delete({ severity });
  }
}
