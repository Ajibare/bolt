export type MarketDataErrorCode =
  'http' | 'rate_limited' | 'invalid_response' | 'provider';

export class MarketDataError extends Error {
  readonly code: MarketDataErrorCode;

  constructor(
    code: MarketDataErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MarketDataError';
    this.code = code;
  }
}

export interface HttpGetJsonOptions {
  baseUrl: string;
  path: string;
  query?: Record<string, string>;
}

export interface HttpJsonClient {
  getJson<T>(options: HttpGetJsonOptions): Promise<T>;
}

export class FetchJsonClient implements HttpJsonClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getJson<T>(options: HttpGetJsonOptions): Promise<T> {
    const url = new URL(options.path, options.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString());
    } catch (cause) {
      throw new MarketDataError(
        'http',
        `Network request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      );
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new MarketDataError(
          'rate_limited',
          'Rate limit exceeded (HTTP 429)',
        );
      }
      throw new MarketDataError('http', `HTTP ${response.status}`);
    }

    const body: unknown = await response.json().catch(() => null);
    if (body === null || typeof body !== 'object') {
      throw new MarketDataError(
        'invalid_response',
        'Response was not valid JSON',
      );
    }
    return body as T;
  }
}
