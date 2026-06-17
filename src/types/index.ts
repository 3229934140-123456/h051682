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
  extract: 'text' | 'html' | 'attr' | 'prop' | 'data';
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

export interface URLOptions {
  baseURL?: string;
  removeFragment?: boolean;
  normalizeProtocol?: boolean;
  sortQueryParams?: boolean;
  removeTrailingSlash?: boolean;
}
