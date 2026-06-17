import type {
  CrawlConfig,
  CrawlConfigResult,
  CrawlPageResult,
  CrawlErrorEntry,
  RetryLogEntry,
  RetryAttempt,
  ExtractionResult,
  CrawlReport,
  PageRule,
  LinkPipelineView,
  LinkPipelineEntry,
  ExportFormat,
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
    const retryAttemptsByUrl: Map<string, RetryAttempt[]> = new Map();
    const finalStatusByUrl: Map<string, { status: number; success: boolean; error?: string }> = new Map();

    crawler.on('task-completed', (task: { url: string; retryCount: number }, result: { status: number; extracted?: ExtractionResult; retryAttempts?: RetryAttempt[] }) => {
      const pageType = this.matchPageType(task.url, config.pageRules);
      if (result.retryAttempts && result.retryAttempts.length > 0) {
        retryAttemptsByUrl.set(task.url, result.retryAttempts);
      }
      finalStatusByUrl.set(task.url, { status: result.status, success: true });
      successes.push({
        url: task.url,
        status: result.status,
        pageType,
        extracted: result.extracted,
        retryCount: task.retryCount,
        retryAttempts: result.retryAttempts,
      });
    });

    crawler.on('task-failed', (task: { url: string; retryCount: number }, error: unknown, retryAttemptsParam?: RetryAttempt[]) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      const httpStatus = this.extractHttpStatus(errMsg);
      const recoverable = httpStatus >= 500 || httpStatus === 408 || httpStatus === 429;
      finalStatusByUrl.set(task.url, { status: httpStatus, success: false, error: errMsg });
      errors.push({
        url: task.url,
        error: errMsg,
        httpStatus,
        recoverable,
        retryCount: task.retryCount,
        retryAttempts: retryAttemptsParam,
      });
    });

    const defaultExtract = config.extract;
    const defaultFollowLinks = config.followLinks;
    const defaultLinkSelector = config.linkSelector;

    if (config.pageRules && config.pageRules.length > 0) {
      await crawler.crawl(config.seedUrls, {
        followLinks: true,
        linkSelector: defaultLinkSelector,
        maxDepth: config.maxDepth,
        pageRules: config.pageRules,
      });

      const results = crawler.getResults();
      for (const [url, crawlResult] of results) {
        const pageType = this.matchPageType(url, config.pageRules);
        const rule = this.matchPageRule(url, config.pageRules);

        if (crawlResult.retryAttempts && crawlResult.retryAttempts.length > 0) {
          retryAttemptsByUrl.set(url, crawlResult.retryAttempts);
          finalStatusByUrl.set(url, { status: crawlResult.status, success: true });
        }

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
              retryCount: crawlResult.retryAttempts ? crawlResult.retryAttempts.length : 0,
              retryAttempts: crawlResult.retryAttempts,
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
          if (crawlResult.retryAttempts && crawlResult.retryAttempts.length > 0) {
            retryAttemptsByUrl.set(url, crawlResult.retryAttempts);
          }
          successes.push({
            url,
            status: crawlResult.status,
            pageType: 'default',
            extracted: crawlResult.extracted,
            retryCount: crawlResult.retryAttempts ? crawlResult.retryAttempts.length : 0,
            retryAttempts: crawlResult.retryAttempts,
          });
        }
      }
    }

    for (const [url, attempts] of retryAttemptsByUrl.entries()) {
      const finalStatus = finalStatusByUrl.get(url);
      retryLog.push({
        url,
        attempts,
        finalStatus: finalStatus?.status ?? 0,
        finalSuccess: finalStatus?.success ?? false,
        finalError: finalStatus?.error,
      });
    }

    const linkPipeline: LinkPipelineView | undefined = this.buildLinkPipeline(
      config.seedUrls,
      crawler.getLinkPipeline()
    );

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
      linkPipeline,
    };
  }

  private buildLinkPipeline(seedUrls: string[], entries: LinkPipelineEntry[]): LinkPipelineView {
    const byReason: Record<string, LinkPipelineEntry[]> = {};
    for (const e of entries) {
      if (!byReason[e.reason]) byReason[e.reason] = [];
      byReason[e.reason].push(e);
    }

    return {
      seedUrls: [...seedUrls],
      discovered: entries,
      byReason,
      summary: {
        total: entries.length,
        enqueued: (byReason.enqueued ?? []).length,
        dedup: (byReason.dedup ?? []).length,
        filter: (byReason.filter ?? []).length,
        domain: (byReason.domain ?? []).length,
        depth: (byReason.depth ?? []).length,
        deny: (byReason.deny ?? []).length,
        nonHttp: (byReason['non-http'] ?? []).length,
        notAllowed: (byReason['not-allowed'] ?? []).length,
      },
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
    linkPipeline: result.linkPipeline,
  };

  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
}

export function exportItems(result: CrawlConfigResult, filePath: string): void {
  const items = result.mergedItems ?? [];
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
}

export function exportCrawl(result: CrawlConfigResult, filePath: string, format: ExportFormat = 'report'): void {
  switch (format) {
    case 'report':
      exportReport(result, filePath);
      break;
    case 'items-json':
      exportItems(result, filePath);
      break;
    case 'items-csv':
      exportItemsCSV(result, filePath);
      break;
    default:
      exportReport(result, filePath);
  }
}

export function exportItemsCSV(result: CrawlConfigResult, filePath: string): void {
  const items = result.mergedItems ?? [];
  if (items.length === 0) {
    ensureDir(filePath);
    fs.writeFileSync(filePath, '', 'utf-8');
    return;
  }

  const allKeys: string[] = [];
  const keySet = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (!keySet.has(key)) {
        keySet.add(key);
        allKeys.push(key);
      }
    }
  }

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      const str = JSON.stringify(v);
      return `"${str.replace(/"/g, '""')}"`;
    }
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = allKeys.join(',');
  const rows = items.map((item) => allKeys.map((k) => escape(item[k])).join(','));
  const csv = [header, ...rows].join('\n');

  ensureDir(filePath);
  fs.writeFileSync(filePath, '\uFEFF' + csv, 'utf-8');
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
