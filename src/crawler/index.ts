import type {
  CrawlerOptions,
  CrawlTask,
  CrawlResult,
  ExtractionSchema,
  ExtractionResult,
  Action,
} from '../types';
import { parseHTML, outerHTML } from '../html-parser';
import { querySelectorAll } from '../css-selector';
import { DataExtractor } from '../extraction';
import { ActionExecutor, ActionContext } from '../action-executor';
import { Fetcher, createFetcher } from './fetcher';
import { TaskQueue, createTaskQueue } from './task-queue';
import { URLDeduplicator, createURLDeduplicator } from './url-deduplicator';
import {
  resolveRelativeURL,
  normalizeURL,
  urlToFingerprint,
  isHTTPURL,
  isInternalURL,
  getHostname,
} from './url-utils';

export interface CrawlerStats {
  tasksTotal: number;
  tasksPending: number;
  tasksProcessing: number;
  tasksCompleted: number;
  tasksFailed: number;
  urlsSeen: number;
  urlsVisited: number;
  urlsFailed: number;
  urlsPending: number;
  currentConcurrency: number;
  startTime: number;
  elapsedTime: number;
}

export interface CrawlOptions {
  extract?: ExtractionSchema;
  actions?: Action[];
  followLinks?: boolean;
  linkSelector?: string;
  maxDepth?: number;
}

export class Crawler {
  private options: Required<CrawlerOptions>;
  private fetcher: Fetcher;
  private queue: TaskQueue;
  private deduplicator: URLDeduplicator;
  private extractor: DataExtractor;
  private actionExecutor: ActionExecutor;
  private activeTasks: Map<string, CrawlTask> = new Map();
  private results: Map<string, CrawlResult & { extracted?: ExtractionResult }> = new Map();
  private isRunning: boolean = false;
  private startTime: number = 0;
  private taskIdCounter: number = 0;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(options: CrawlerOptions = {}) {
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 5,
      maxDepth: options.maxDepth ?? 3,
      rateLimit: options.rateLimit ?? 1000,
      requestTimeout: options.requestTimeout ?? 30000,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      userAgent: options.userAgent ?? 'Mozilla/5.0 (compatible; WebScraper/1.0)',
      respectRobotsTxt: options.respectRobotsTxt ?? true,
      allowedDomains: options.allowedDomains ?? [],
      urlFilter: options.urlFilter ?? (() => true),
    };

    this.fetcher = createFetcher({
      timeout: this.options.requestTimeout,
      retries: this.options.maxRetries,
      retryDelay: this.options.retryDelay,
      userAgent: this.options.userAgent,
      rateLimit: this.options.rateLimit,
    });

    this.queue = createTaskQueue({ strategy: 'fifo' });
    this.deduplicator = createURLDeduplicator();
    this.extractor = new DataExtractor();
    this.actionExecutor = new ActionExecutor();
  }

  public async crawl(seedUrls: string | string[], options: CrawlOptions = {}): Promise<Map<string, CrawlResult & { extracted?: ExtractionResult }>> {
    this.startTime = Date.now();
    this.isRunning = true;

    const seeds = Array.isArray(seedUrls) ? seedUrls : [seedUrls];

    for (const url of seeds) {
      this.addTask(url, 0);
    }

    await this.processQueue(options);

    this.isRunning = false;
    return this.results;
  }

  public addTask(url: string, depth: number, parentUrl?: string): boolean {
    const normalizedURL = normalizeURL(url);
    const fingerprint = urlToFingerprint(normalizedURL);

    if (this.deduplicator.isSeen(url, normalizedURL, fingerprint)) {
      return false;
    }

    if (!isHTTPURL(url)) {
      return false;
    }

    if (this.options.allowedDomains.length > 0) {
      const hostname = getHostname(url);
      if (!this.options.allowedDomains.includes(hostname)) {
        return false;
      }
    }

    if (!this.options.urlFilter(url)) {
      return false;
    }

    if (depth > this.options.maxDepth) {
      return false;
    }

    const task: CrawlTask = {
      id: this.generateTaskId(),
      url,
      depth,
      priority: 0,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      parentUrl,
    };

    this.deduplicator.markAsPending(url, normalizedURL, fingerprint, depth);

    if (this.queue.enqueue(task)) {
      this.emit('task-added', task);
      return true;
    }

    return false;
  }

  private async processQueue(options: CrawlOptions): Promise<void> {
    const maxConcurrency = this.options.maxConcurrency;
    const workers: Promise<void>[] = [];

    for (let i = 0; i < maxConcurrency; i++) {
      workers.push(this.worker(options));
    }

    await Promise.all(workers);
  }

  private async worker(options: CrawlOptions): Promise<void> {
    while (this.isRunning) {
      const task = this.queue.dequeue();

      if (!task) {
        if (this.activeTasks.size === 0) {
          break;
        }
        await this.delay(100);
        continue;
      }

      task.status = 'processing';
      this.activeTasks.set(task.id, task);
      this.emit('task-started', task);

      try {
        const result = await this.processTask(task, options);
        this.results.set(task.url, result);

        task.status = 'completed';
        this.deduplicator.markAsVisited(task.url, normalizeURL(task.url));
        this.emit('task-completed', task, result);
      } catch (error) {
        task.status = 'failed';
        this.deduplicator.markAsFailed(task.url, normalizeURL(task.url));
        this.emit('task-failed', task, error);
      } finally {
        this.activeTasks.delete(task.id);
      }
    }
  }

  private async processTask(task: CrawlTask, options: CrawlOptions): Promise<CrawlResult & { extracted?: ExtractionResult }> {
    const fetchResult = await this.fetcher.fetch(task);

    task.retryCount = fetchResult.attempts - 1;

    if (!fetchResult.success) {
      throw new Error(fetchResult.error ?? `HTTP ${fetchResult.status}`);
    }

    const dom = parseHTML(fetchResult.html);

    if (options.actions && options.actions.length > 0) {
      const actionContext: ActionContext = {
        dom,
        variables: {},
        results: {},
        currentUrl: task.url,
        delay: (ms: number) => this.delay(ms),
      };

      await this.actionExecutor.execute(options.actions, actionContext);
    }

    let extracted: ExtractionResult | undefined;
    if (options.extract) {
      extracted = this.extractor.extract(
        { dom, baseUrl: task.url, variables: {} },
        options.extract
      );
    }

    if (options.followLinks && task.depth < (options.maxDepth ?? this.options.maxDepth)) {
      const linkSelector = options.linkSelector ?? 'a[href]';
      const links = querySelectorAll(dom, linkSelector);

      for (const link of links) {
        const href = link.attributes.href;
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          const absoluteURL = resolveRelativeURL(href, task.url);
          const normalizedURL = normalizeURL(absoluteURL);

          if (isInternalURL(normalizedURL, task.url)) {
            this.addTask(normalizedURL, task.depth + 1, task.url);
          }
        }
      }
    }

    return {
      taskId: task.id,
      url: task.url,
      status: fetchResult.status,
      html: fetchResult.html,
      headers: fetchResult.headers,
      fetchedAt: Date.now(),
      responseTime: fetchResult.responseTime,
      extracted,
    };
  }

  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  public off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      }
    }
  }

  public getStats(): CrawlerStats {
    const queueStats = this.queue.getStats();
    const dedupStats = this.deduplicator.getStats();

    return {
      tasksTotal: queueStats.total + this.results.size,
      tasksPending: queueStats.pending,
      tasksProcessing: this.activeTasks.size,
      tasksCompleted: this.getCompletedCount(),
      tasksFailed: this.getFailedCount(),
      urlsSeen: dedupStats.total,
      urlsVisited: dedupStats.visited,
      urlsFailed: dedupStats.failed,
      urlsPending: dedupStats.pending,
      currentConcurrency: this.activeTasks.size,
      startTime: this.startTime,
      elapsedTime: Date.now() - this.startTime,
    };
  }

  private getCompletedCount(): number {
    let count = 0;
    for (const result of this.results.values()) {
      if (result.status >= 200 && result.status < 400) {
        count++;
      }
    }
    return count;
  }

  private getFailedCount(): number {
    let count = 0;
    for (const result of this.results.values()) {
      if (result.status >= 400 || result.status === 0) {
        count++;
      }
    }
    return count;
  }

  public pause(): void {
    this.isRunning = false;
  }

  public resume(): void {
    this.isRunning = true;
  }

  public stop(): void {
    this.isRunning = false;
    this.queue.clear();
    this.activeTasks.clear();
  }

  public getResults(): Map<string, CrawlResult & { extracted?: ExtractionResult }> {
    return this.results;
  }

  public clearResults(): void {
    this.results.clear();
  }

  private generateTaskId(): string {
    return `task-${++this.taskIdCounter}-${Date.now()}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createCrawler(options: CrawlerOptions = {}): Crawler {
  return new Crawler(options);
}

export { CrawlConfigRunner, runCrawlConfig, createCrawlConfig, exportReport } from './crawl-config-runner';
export { URLDeduplicator, createURLDeduplicator } from './url-deduplicator';
