import type { Role } from "../enums/app.enum.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthResponse {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}
