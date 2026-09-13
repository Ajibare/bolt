import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { AuthResponse } from '@trading-bolt/shared';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { PasswordService } from './password.service.js';
import { parseDurationToSeconds } from './duration.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { JwtAccessPayload } from './jwt-auth.guard.js';

type JwtExpiry = `${number}${JwtUnit}`;
type JwtUnit = 's' | 'm' | 'h' | 'd' | 'w';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.users.create({ email: dto.email, passwordHash });
    return this.issueAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithCredentials(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await this.passwords.verify(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueAuthResponse(user);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.sessions.revokeByHash(
      userId,
      SessionsService.hashToken(refreshToken),
    );
  }

  async getCurrentUser(userId: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return UsersService.toPublicUser(user);
  }

  private async issueAuthResponse(user: User): Promise<AuthResponse> {
    const accessExpiresIn = this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
    const refreshTtl =
      this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '7d';

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      } satisfies JwtAccessPayload,
      { expiresIn: accessExpiresIn as JwtExpiry },
    );

    const refreshToken = SessionsService.generateRefreshToken();
    const expiresAt = new Date(
      Date.now() + parseDurationToSeconds(refreshTtl) * 1000,
    );
    await this.sessions.createSession(
      user.id,
      SessionsService.hashToken(refreshToken),
      expiresAt,
    );

    return {
      user: UsersService.toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken,
        expiresInSeconds: parseDurationToSeconds(accessExpiresIn),
      },
    };
  }
}
