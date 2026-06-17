import type {
  CrawlConfig,
  CrawlConfigResult,
  CrawlPageResult,
  CrawlErrorEntry,
  RetryLogEntry,
  ExtractionResult,
  CrawlReport,
  PageRule,
} from '../types';
import { Crawler } from './index';
import * as fs from 'fs';
import * as path from 'path';

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

    const successes: CrawlPageResult[] = [];
    const errors: CrawlErrorEntry[] = [];
    const retryLog: RetryLogEntry[] = [];

    crawler.on('task-completed', (task: { url: string; retryCount: number }, result: { status: number; extracted?: ExtractionResult }) => {
      const pageType = this.matchPageType(task.url, config.pageRules);
      successes.push({
        url: task.url,
        status: result.status,
        pageType,
        extracted: result.extracted,
        retryCount: task.retryCount,
      });
    });

    crawler.on('task-failed', (task: { url: string; retryCount: number }, error: unknown) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      const httpStatus = this.extractHttpStatus(errMsg);
      const recoverable = httpStatus >= 500 || httpStatus === 408 || httpStatus === 429;
      errors.push({
        url: task.url,
        error: errMsg,
        httpStatus,
        recoverable,
        retryCount: task.retryCount,
      });

      if (task.retryCount > 0) {
        retryLog.push({
          url: task.url,
          attempt: task.retryCount,
          httpStatus,
          error: errMsg,
          timestamp: Date.now(),
          recoverable,
        });
      }
    });

    const defaultExtract = config.extract;
    const defaultFollowLinks = config.followLinks;
    const defaultLinkSelector = config.linkSelector;

    if (config.pageRules && config.pageRules.length > 0) {
      await crawler.crawl(config.seedUrls, {
        followLinks: true,
        linkSelector: defaultLinkSelector,
        maxDepth: config.maxDepth,
      });

      const results = crawler.getResults();
      for (const [url, crawlResult] of results) {
        const pageType = this.matchPageType(url, config.pageRules);
        const rule = this.matchPageRule(url, config.pageRules);

        if (rule) {
          const { DataExtractor } = require('../extraction');
          const { parseHTML } = require('../html-parser');
          const extractor = new DataExtractor();
          const dom = parseHTML(crawlResult.html);
          const extracted = extractor.extract(
            { dom, baseUrl: url, variables: {} },
            rule.extract
          );

          const existing = successes.find(s => s.url === url);
          if (existing) {
            existing.pageType = pageType;
            existing.extracted = extracted;
          } else {
            successes.push({
              url,
              status: crawlResult.status,
              pageType,
              extracted,
              retryCount: 0,
            });
          }
        }
      }
    } else {
      await crawler.crawl(config.seedUrls, {
        followLinks: defaultFollowLinks,
        linkSelector: defaultLinkSelector,
        extract: defaultExtract,
        actions: config.actions,
        maxDepth: config.maxDepth,
      });

      if (successes.length === 0) {
        const results = crawler.getResults();
        for (const [url, crawlResult] of results) {
          successes.push({
            url,
            status: crawlResult.status,
            pageType: 'default',
            extracted: crawlResult.extracted,
            retryCount: 0,
          });
        }
      }
    }

    const endTime = Date.now();

    let mergedItems: ExtractionResult[] | undefined;
    if (config.mergeBy) {
      mergedItems = this.mergeResults(successes, config.mergeBy);
    }

    return {
      configName: config.name,
      seedUrls: config.seedUrls,
      pagesCrawled: successes.length,
      pagesFailed: errors.length,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      results: successes,
      errors,
      retryLog,
      mergedItems,
    };
  }

  private matchPageType(url: string, pageRules?: CrawlConfig['pageRules']): string {
    if (!pageRules) return 'default';
    for (const rule of pageRules) {
      if (this.urlMatchesPattern(url, rule.pattern)) {
        if (rule.pattern instanceof RegExp) return rule.pattern.source;
        return rule.pattern;
      }
    }
    return 'default';
  }

  private matchPageRule(url: string, pageRules?: CrawlConfig['pageRules']): PageRule | null {
    if (!pageRules) return null;
    for (const rule of pageRules) {
      if (this.urlMatchesPattern(url, rule.pattern)) {
        return rule;
      }
    }
    return null;
  }

  private urlMatchesPattern(url: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    return url.includes(pattern);
  }

  private extractHttpStatus(errorMessage: string): number {
    const match = errorMessage.match(/HTTP\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  private mergeResults(results: CrawlPageResult[], mergeByKey: string): ExtractionResult[] {
    const groups: Map<string, ExtractionResult> = new Map();

    const flatItems: ExtractionResult[] = [];

    for (const result of results) {
      if (!result.extracted) continue;
      this.flattenExtracted(result.extracted, mergeByKey, flatItems);
    }

    for (const item of flatItems) {
      const key = item[mergeByKey];
      if (key === undefined || key === null) continue;

      const keyStr = String(key);
      const existing = groups.get(keyStr);

      if (existing) {
        for (const [k, v] of Object.entries(item)) {
          if (k === mergeByKey) continue;
          if (existing[k] === undefined || existing[k] === null || existing[k] === '') {
            existing[k] = v;
          } else if (Array.isArray(existing[k]) && !Array.isArray(v)) {
            (existing[k] as unknown[]).push(v);
          }
        }
      } else {
        groups.set(keyStr, { ...item });
      }
    }

    return Array.from(groups.values());
  }

  private flattenExtracted(data: ExtractionResult, mergeByKey: string, out: ExtractionResult[]): void {
    if (data[mergeByKey] !== undefined) {
      out.push(data);
      return;
    }

    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            this.flattenExtracted(item as ExtractionResult, mergeByKey, out);
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        this.flattenExtracted(value as ExtractionResult, mergeByKey, out);
      }
    }
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

export function exportReport(result: CrawlConfigResult, filePath: string): void {
  const report: CrawlReport = {
    configName: result.configName,
    seedUrls: result.seedUrls,
    summary: {
      pagesCrawled: result.pagesCrawled,
      pagesFailed: result.pagesFailed,
      durationMs: result.durationMs,
      startTime: new Date(result.startTime).toISOString(),
      endTime: new Date(result.endTime).toISOString(),
    },
    pages: result.results,
    errors: result.errors,
    retryLog: result.retryLog,
    mergedItems: result.mergedItems,
  };

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
}
