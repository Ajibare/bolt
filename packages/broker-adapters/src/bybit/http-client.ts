import { createHmac } from "node:crypto";
import { BrokerError } from "../errors.js";
import type { FetchLike, FetchLikeResponse } from "./types.js";

/**
 * Signed HTTP client for the Bybit v5 private API (AGENTS.md §20/§8).
 *
 * Requests carry the X-BAPI-* authentication headers (HMAC-SHA256 over
 * `timestamp + apiKey + recvWindow + bodyOrQuery`). The secret is used only to
 * sign requests in memory and is never logged or exposed.
 */

export interface BybitHttpRequest {
  method: "GET" | "POST";
  path: string;
  /** Raw JSON string body for POST requests. */
  body?: string;
  /** Sorted query string (without leading ?) for GET requests. */
  query?: string;
}

export type BybitHttpClientOptions = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  recvWindow: number;
  fetchImpl: FetchLike;
};

export class BybitHttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: BybitHttpClientOptions) {
    this.fetchImpl = options.fetchImpl;
  }

  /**
   * Executes a signed request and returns the decoded v5 envelope. Throws
   * `BrokerError` on transport failures and on non-zero `retCode`.
   */
  async request<T>(request: BybitHttpRequest): Promise<T> {
    const { apiKey, apiSecret } = this.options;
    const timestamp = Date.now().toString();
    const recvWindow = String(this.options.recvWindow);
    const payload = `${timestamp}${apiKey}${recvWindow}${request.method === "POST" ? (request.body ?? "") : (request.query ?? "")}`;
    const signature = createHmac("sha256", apiSecret).update(payload).digest("hex");

    const url = `${this.options.baseUrl}${request.path}${request.query ? `?${request.query}` : ""}`;
    const headers: Record<string, string> = {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": signature,
      "X-BAPI-SIGN-TYPE": "2",
    };
    if (request.method === "POST") {
      headers["Content-Type"] = "application/json";
    }

    let response: FetchLikeResponse;
    try {
      response = await this.fetchImpl(url, {
        method: request.method,
        headers,
        body: request.method === "POST" ? request.body : undefined,
      });
    } catch (cause) {
      throw new BrokerError(
        `Bybit request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    if (!response.ok) {
      throw new BrokerError(`Bybit HTTP ${response.status} (${response.statusText})`);
    }

    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new BrokerError("Bybit returned a non-JSON response");
    }
    const decoded = envelope as { retCode?: number; retMsg?: string };
    if (typeof decoded.retCode !== "number" || decoded.retCode !== 0) {
      throw new BrokerError(
        `Bybit error ${String(decoded.retCode)}: ${decoded.retMsg ?? "unknown"}`,
      );
    }
    return envelope as T;
  }
}
