import type { FetchOptions, CrawlResult, CrawlTask, RetryAttempt } from '../types';

export interface FetchResult {
  success: boolean;
  status: number;
  html: string;
  headers: Record<string, string>;
  responseTime: number;
  attempts: number;
  retryAttempts: RetryAttempt[];
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
    const retryAttempts: RetryAttempt[] = [];
    let lastError: Error | null = null;
    let finalStatus = 0;

    for (let attempt = 0; attempt <= options.retries; attempt++) {
      try {
        await this.rateLimiter.wait();

        const result = await this.doFetch(task.url, options);
        finalStatus = result.status;

        if (result.success) {
          retryAttempts.push({
            attempt: attempt + 1,
            httpStatus: result.status,
            error: '',
            timestamp: Date.now(),
            recoverable: false,
          });
          return { ...result, attempts: attempt + 1, retryAttempts };
        }

        if (this.shouldRetry(result.status, attempt, options.retries)) {
          const errMsg = `HTTP ${result.status}`;
          const recoverable = this.isRecoverable(result.status);
          retryAttempts.push({
            attempt: attempt + 1,
            httpStatus: result.status,
            error: errMsg,
            timestamp: Date.now(),
            recoverable,
          });
          throw new Error(errMsg);
        }

        retryAttempts.push({
          attempt: attempt + 1,
          httpStatus: result.status,
          error: `HTTP ${result.status}`,
          timestamp: Date.now(),
          recoverable: this.isRecoverable(result.status),
        });
        return { ...result, attempts: attempt + 1, retryAttempts };
      } catch (error) {
        lastError = error as Error;

        if (attempt < options.retries) {
          const statusFromMsg = this.extractStatusFromError(lastError.message);
          if (retryAttempts.length === 0 || retryAttempts[retryAttempts.length - 1].attempt !== attempt + 1) {
            retryAttempts.push({
              attempt: attempt + 1,
              httpStatus: statusFromMsg || finalStatus || 0,
              error: lastError.message,
              timestamp: Date.now(),
              recoverable: this.isRecoverable(statusFromMsg || finalStatus || 0),
            });
          }
          const delay = this.calculateRetryDelay(attempt, options.retryDelay);
          await this.delay(delay);
        } else if (retryAttempts.length === 0 || retryAttempts[retryAttempts.length - 1].attempt !== attempt + 1) {
          const statusFromMsg = this.extractStatusFromError(lastError.message);
          retryAttempts.push({
            attempt: attempt + 1,
            httpStatus: statusFromMsg || finalStatus || 0,
            error: lastError.message,
            timestamp: Date.now(),
            recoverable: this.isRecoverable(statusFromMsg || finalStatus || 0),
          });
        }
      }
    }

    return {
      success: false,
      status: finalStatus,
      html: '',
      headers: {},
      responseTime: 0,
      attempts: options.retries + 1,
      retryAttempts,
      error: lastError?.message ?? 'Unknown error',
    };
  }

  private extractStatusFromError(message: string): number {
    const match = message.match(/HTTP\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  private isRecoverable(status: number): boolean {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(status);
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
        attempts: 1,
        retryAttempts: [],
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        html: '',
        headers: {},
        responseTime: Date.now() - startTime,
        attempts: 1,
        retryAttempts: [],
        error: (error as Error).message,
      };
    }
  }

  private shouldRetry(status: number, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) return false;
    return this.isRecoverable(status);
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
