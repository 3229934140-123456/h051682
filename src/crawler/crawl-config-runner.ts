import type {
  CrawlConfig,
  CrawlConfigResult,
  CrawlResult,
  ExtractionResult,
} from '../types';
import { Crawler } from './index';

export class CrawlConfigRunner {
  public async run(config: CrawlConfig): Promise<CrawlConfigResult> {
    const startTime = Date.now();

    const crawler = new Crawler({
      maxConcurrency: config.maxConcurrency,
      maxDepth: config.maxDepth,
      rateLimit: config.rateLimit,
      requestTimeout: config.requestTimeout,
      maxRetries: config.maxRetries,
      retryDelay: config.retryDelay,
      userAgent: config.userAgent,
      allowedDomains: config.allowedDomains,
      respectRobotsTxt: config.respectRobotsTxt,
      urlFilter: config.urlFilter,
    });

    const successes: Array<{ url: string; status: number; extracted?: ExtractionResult }> = [];
    const errors: Array<{ url: string; error: string }> = [];

    crawler.on('task-completed', (_task: unknown, result: CrawlResult & { extracted?: ExtractionResult }) => {
      successes.push({
        url: result.url,
        status: result.status,
        extracted: result.extracted,
      });
    });

    crawler.on('task-failed', (task: { url: string }, error: unknown) => {
      errors.push({
        url: task.url,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    await crawler.crawl(config.seedUrls, {
      followLinks: config.followLinks,
      linkSelector: config.linkSelector,
      extract: config.extract,
      actions: config.actions,
      maxDepth: config.maxDepth,
    });

    const endTime = Date.now();

    return {
      configName: config.name,
      pagesCrawled: successes.length,
      pagesFailed: errors.length,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      results: successes,
      errors,
    };
  }

  public async runMany(configs: CrawlConfig[]): Promise<CrawlConfigResult[]> {
    const results: CrawlConfigResult[] = [];
    for (const config of configs) {
      const result = await this.run(config);
      results.push(result);
    }
    return results;
  }
}

export function createCrawlConfig(
  name: string,
  seedUrls: string[],
  options: Omit<CrawlConfig, 'name' | 'seedUrls'> = {}
): CrawlConfig {
  return {
    name,
    seedUrls,
    ...options,
  };
}

export function runCrawlConfig(config: CrawlConfig): Promise<CrawlConfigResult> {
  const runner = new CrawlConfigRunner();
  return runner.run(config);
}
