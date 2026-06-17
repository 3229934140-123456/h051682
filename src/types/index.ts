export interface DOMNode {
  nodeType: number;
  tagName?: string;
  textContent?: string;
  attributes: Record<string, string>;
  children: DOMNode[];
  parent: DOMNode | null;
  childIndex: number;
}

export interface ElementNode extends DOMNode {
  nodeType: 1;
  tagName: string;
}

export interface TextNode extends DOMNode {
  nodeType: 3;
  textContent: string;
}

export interface CommentNode extends DOMNode {
  nodeType: 8;
  textContent: string;
}

export type CSSCombinator = ' ' | '>' | '+' | '~';

export type PseudoClass =
  | ':first-child'
  | ':last-child'
  | ':nth-child(n)'
  | ':nth-of-type(n)'
  | ':only-child'
  | ':empty'
  | ':has(selector)'
  | ':not(selector)';

export interface CSSSelectorPart {
  tagName?: string;
  id?: string;
  classNames: string[];
  attributes: Array<{
    name: string;
    operator?: '=' | '~=' | '|=' | '^=' | '$=' | '*=';
    value?: string;
  }>;
  pseudoClasses: Array<{
    name: string;
    argument?: string;
  }>;
  combinator?: CSSCombinator;
}

export interface CSSSelector {
  parts: CSSSelectorPart[];
  specificity: number;
}

export type ActionType =
  | 'click'
  | 'type'
  | 'select'
  | 'scroll'
  | 'hover'
  | 'focus'
  | 'blur'
  | 'submit'
  | 'wait'
  | 'evaluate';

export interface Action {
  type: ActionType;
  selector?: string;
  value?: string | number | boolean;
  options?: Record<string, unknown>;
  delay?: number;
}

export interface ExtractionRule {
  name: string;
  selector: string;
  extract: 'text' | 'html' | 'attr' | 'prop' | 'data' | 'self';
  attrName?: string;
  dataKey?: string;
  multiple?: boolean;
  defaultValue?: unknown;
  transform?: (value: unknown) => unknown;
  nested?: Record<string, ExtractionRule>;
}

export interface ExtractionSchema {
  [key: string]: ExtractionRule | ExtractionSchema;
}

export interface ExtractionResult {
  [key: string]: unknown;
}

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface CrawlTask {
  id: string;
  url: string;
  depth: number;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  createdAt: number;
  parentUrl?: string;
  fetchOptions?: FetchOptions;
}

export interface CrawlResult {
  taskId: string;
  url: string;
  status: number;
  html: string;
  headers: Record<string, string>;
  fetchedAt: number;
  responseTime: number;
}

export interface RetryAttempt {
  attempt: number;
  httpStatus: number;
  error: string;
  timestamp: number;
  recoverable: boolean;
}

export interface RetryLogEntry {
  url: string;
  attempts: RetryAttempt[];
  finalStatus: number;
  finalSuccess: boolean;
  finalError?: string;
}

export interface CrawlerOptions {
  maxConcurrency?: number;
  maxDepth?: number;
  rateLimit?: number;
  requestTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  userAgent?: string;
  respectRobotsTxt?: boolean;
  allowedDomains?: string[];
  urlFilter?: (url: string) => boolean;
}

export interface PageRule {
  pattern: string | RegExp;
  extract: ExtractionSchema;
  followLinks?: boolean;
  linkSelector?: string;
  followLinkPatterns?: Array<string | RegExp>;
  denyLinkPatterns?: Array<string | RegExp>;
}

export interface LinkPipelineEntry {
  url: string;
  foundFrom: string;
  reason: 'enqueued' | 'dedup' | 'filter' | 'domain' | 'depth' | 'deny' | 'non-http' | 'not-allowed';
}

export interface LinkPipelineView {
  seedUrls: string[];
  discovered: LinkPipelineEntry[];
  byReason: Record<string, LinkPipelineEntry[]>;
  summary: {
    total: number;
    enqueued: number;
    dedup: number;
    filter: number;
    domain: number;
    depth: number;
    deny: number;
    nonHttp: number;
    notAllowed: number;
  };
}

export interface CrawlConfig {
  name: string;
  seedUrls: string[];
  followLinks?: boolean;
  linkSelector?: string;
  urlFilter?: (url: string) => boolean;
  extract?: ExtractionSchema;
  pageRules?: PageRule[];
  mergeBy?: string;
  actions?: Action[];
  maxDepth?: number;
  maxConcurrency?: number;
  rateLimit?: number;
  requestTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  userAgent?: string;
  allowedDomains?: string[];
  respectRobotsTxt?: boolean;
}

export interface CrawlPageResult {
  url: string;
  status: number;
  pageType: string;
  extracted?: ExtractionResult;
  retryCount: number;
  retryAttempts?: RetryAttempt[];
}

export interface CrawlErrorEntry {
  url: string;
  error: string;
  httpStatus: number;
  recoverable: boolean;
  retryCount: number;
  retryAttempts?: RetryAttempt[];
}

export interface CrawlConfigResult {
  configName: string;
  seedUrls: string[];
  pagesCrawled: number;
  pagesFailed: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  results: CrawlPageResult[];
  errors: CrawlErrorEntry[];
  retryLog: RetryLogEntry[];
  mergedItems?: ExtractionResult[];
  linkPipeline?: LinkPipelineView;
}

export interface CrawlReport {
  configName: string;
  seedUrls: string[];
  summary: {
    pagesCrawled: number;
    pagesFailed: number;
    durationMs: number;
    startTime: string;
    endTime: string;
  };
  pages: CrawlPageResult[];
  errors: CrawlErrorEntry[];
  retryLog: RetryLogEntry[];
  mergedItems?: ExtractionResult[];
  linkPipeline?: LinkPipelineView;
}

export interface URLOptions {
  baseURL?: string;
  removeFragment?: boolean;
  normalizeProtocol?: boolean;
  sortQueryParams?: boolean;
  removeTrailingSlash?: boolean;
}

export type ExportFormat = 'report' | 'items-json' | 'items-csv';
