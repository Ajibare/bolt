import { createHmac } from "node:crypto";
import { BrokerError } from "../errors.js";
import { buildSignatureQuery } from "./mappers.js";
import {
  BinanceApiError,
  type BinanceErrorBody,
  type FetchLike,
  type FetchLikeResponse,
} from "./types.js";

/**
 * Signed HTTP client for the Binance spot API (AGENTS.md §20/§8).
 *
 * Requests carry HMAC-SHA256 over the sorted, URL-encoded query string
 * (which always contains `timestamp` and `recvWindow`) plus the
 * `X-MBX-APIKEY` header. The secret is used only to sign requests in memory
 * and is never logged or exposed. Non-2xx replies are surfaced as
 * `BinanceApiError` with the provider code so callers can branch safely.
 */

export interface BinanceHttpClientOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  recvWindow: number;
  fetchImpl: FetchLike;
  now: () => number;
}

export class BinanceHttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: BinanceHttpClientOptions) {
    this.fetchImpl = options.fetchImpl;
  }

  /**
   * Executes a signed request against a private endpoint. Parameters travel in
   * the query string (Binance accepts them there for GET/POST/DELETE), so the
   * exact string that is signed is also what the server validates.
   */
  async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const { apiKey, apiSecret } = this.options;
    const timestamp = String(this.options.now());
    const query = buildSignatureQuery({
      ...params,
      timestamp,
      recvWindow: String(this.options.recvWindow),
    });
    const signature = createHmac("sha256", apiSecret).update(query).digest("hex");

    const url = `${this.options.baseUrl}${path}?${query}&signature=${signature}`;
    const headers: Record<string, string> = {
      "X-MBX-APIKEY": apiKey,
      "Content-Type": "application/json",
    };

    let response: FetchLikeResponse;
    try {
      response = await this.fetchImpl(url, { method, headers });
    } catch (cause) {
      throw new BrokerError(
        `Binance request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    if (!response.ok) {
      throw await this.errorFrom(response);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BrokerError("Binance returned a non-JSON response");
    }
    return body as T;
  }

  /** Builds a BinanceApiError preferring the provider error envelope when present. */
  private async errorFrom(response: FetchLikeResponse): Promise<BinanceApiError> {
    let code = response.status;
    let message = response.statusText || "unknown error";
    try {
      const body = (await response.json()) as BinanceErrorBody;
      if (typeof body.code === "number" && body.msg) {
        code = body.code;
        message = body.msg;
      }
    } catch {
      /* non-JSON error body — fall back to the HTTP status */
    }
    return new BinanceApiError(code, message);
  }
}
