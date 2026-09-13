import type { AuthTokens } from "@trading-bolt/shared";

const ACCESS_TOKEN_KEY = "trading_bolt.access_token";
const REFRESH_TOKEN_KEY = "trading_bolt.refresh_token";

function read(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(key);
}

function write(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, value);
}

export const authStorage = {
  getAccessToken(): string | null {
    return read(ACCESS_TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    return read(REFRESH_TOKEN_KEY);
  },

  setTokens(tokens: AuthTokens): void {
    write(ACCESS_TOKEN_KEY, tokens.accessToken);
    write(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },

  clear(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
