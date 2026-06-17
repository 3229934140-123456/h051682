import type { FetchOptions, CrawlResult, CrawlTask } from '../types';

export interface FetchResult {
  success: boolean;
  status: number;
  html: string;
  headers: Record<string, string>;
  responseTime: number;
  error?: string;
}

export class Fetcher {
  private defaultOptions: Required<Pick<FetchOptions, 'timeout' | 'retries' | 'retryDelay' | 'method'>>;
  private userAgent: string;
  private rateLimiter: RateLimiter;

  constructor(
    options: {
      timeout?: number;
      retries?: number;
      retryDelay?: number;
      userAgent?: string;
      rateLimit?: number;
    } = {}
  ) {
    this.defaultOptions = {
      timeout: options.timeout ?? 30000,
      retries: options.retries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      method: 'GET',
    };
    this.userAgent = options.userAgent ?? 'Mozilla/5.0 (compatible; WebScraper/1.0)';
    this.rateLimiter = new RateLimiter(options.rateLimit ?? 1000);
  }

  public async fetch(task: CrawlTask): Promise<FetchResult> {
    const options = { ...this.defaultOptions, ...task.fetchOptions };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= options.retries; attempt++) {
      try {
        await this.rateLimiter.wait();

        const result = await this.doFetch(task.url, options);

        if (result.success) {
          return result;
        }

        if (this.shouldRetry(result.status, attempt, options.retries)) {
          throw new Error(`HTTP ${result.status}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        if (attempt < options.retries) {
          const delay = this.calculateRetryDelay(attempt, options.retryDelay);
          await this.delay(delay);
        }
      }
    }

    return {
      success: false,
      status: 0,
      html: '',
      headers: {},
      responseTime: 0,
      error: lastError?.message ?? 'Unknown error',
    };
  }

  private async doFetch(url: string, options: typeof this.defaultOptions & FetchOptions): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      const response = await fetch(url, {
        method: options.method,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const html = await response.text();

      return {
        success: response.ok,
        status: response.status,
        html,
        headers,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        html: '',
        headers: {},
        responseTime: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  private shouldRetry(status: number, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) return false;

    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(status);
  }

  private calculateRetryDelay(attempt: number, baseDelay: number): number {
    return baseDelay * Math.pow(2, attempt);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public setUserAgent(userAgent: string): void {
    this.userAgent = userAgent;
  }

  public setRateLimit(requestsPerSecond: number): void {
    this.rateLimiter.setRateLimit(requestsPerSecond);
  }

  public getUserAgent(): string {
    return this.userAgent;
  }
}

class RateLimiter {
  private minInterval: number;
  private lastRequestTime: number = 0;

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / Math.max(1, requestsPerSecond);
  }

  public async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minInterval - elapsed));
    }

    this.lastRequestTime = Date.now();
  }

  public setRateLimit(requestsPerSecond: number): void {
    this.minInterval = 1000 / Math.max(1, requestsPerSecond);
  }
}

export function createFetcher(
  options: ConstructorParameters<typeof Fetcher>[0] = {}
): Fetcher {
  return new Fetcher(options);
}
