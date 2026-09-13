import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AuthenticatedUser, PublicUser } from '@trading-bolt/shared';
import { Role } from '@trading-bolt/shared';
import type { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async create(data: {
    email: string;
    passwordHash: string;
    role?: Role;
  }): Promise<User> {
    const user = this.users.create({
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role ?? Role.USER,
    });
    return this.users.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findByEmailWithCredentials(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  static toAuthenticatedUser(user: User): AuthenticatedUser {
    return { id: user.id, email: user.email, role: user.role };
  }

  static toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
