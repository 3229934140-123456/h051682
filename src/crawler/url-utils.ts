import type { URLOptions } from '../types';

const DEFAULT_URL_OPTIONS: Required<URLOptions> = {
  baseURL: '',
  removeFragment: true,
  normalizeProtocol: true,
  sortQueryParams: true,
  removeTrailingSlash: true,
};

export function parseURL(url: string, base?: string): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

export function resolveRelativeURL(relativeUrl: string, baseURL: string): string {
  const parsed = parseURL(relativeUrl, baseURL);
  return parsed ? parsed.href : relativeUrl;
}

export function normalizeURL(url: string, options: Partial<URLOptions> = {}): string {
  const opts = { ...DEFAULT_URL_OPTIONS, ...options };

  try {
    const urlObj = new URL(url, opts.baseURL || undefined);

    if (opts.removeFragment) {
      urlObj.hash = '';
    }

    if (opts.normalizeProtocol) {
      urlObj.protocol = urlObj.protocol.toLowerCase();
    }

    urlObj.hostname = urlObj.hostname.toLowerCase();

    if (opts.sortQueryParams) {
      const params = Array.from(urlObj.searchParams.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );
      urlObj.search = '';
      params.forEach(([key, value]) => {
        urlObj.searchParams.append(key, value);
      });
    }

    let normalized = urlObj.href;

    if (opts.removeTrailingSlash && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return url;
  }
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function getProtocol(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return '';
  }
}

export function getPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '/';
  }
}

export function isSameDomain(url1: string, url2: string): boolean {
  return getHostname(url1) === getHostname(url2);
}

export function isSameOrigin(url1: string, url2: string): boolean {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.protocol === u2.protocol && u1.hostname === u2.hostname && u1.port === u2.port;
  } catch {
    return false;
  }
}

export function isHTTPURL(url: string): boolean {
  const protocol = getProtocol(url);
  return protocol === 'http:' || protocol === 'https:';
}

export function isInternalURL(url: string, baseURL: string): boolean {
  return isSameDomain(url, baseURL);
}

export function getURLDepth(url: string, baseURL: string): number {
  try {
    const basePath = new URL(baseURL).pathname;
    const urlPath = new URL(url).pathname;

    const baseParts = basePath.split('/').filter(Boolean);
    const urlParts = urlPath.split('/').filter(Boolean);

    if (!urlPath.startsWith(basePath)) {
      return -1;
    }

    return urlParts.length - baseParts.length;
  } catch {
    return -1;
  }
}

export function extractQueryParams(url: string): Record<string, string> {
  try {
    const urlObj = new URL(url);
    const params: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } catch {
    return {};
  }
}

export function buildURL(
  base: string,
  path: string,
  params: Record<string, string> = {}
): string {
  try {
    const urlObj = new URL(path, base);
    Object.entries(params).forEach(([key, value]) => {
      urlObj.searchParams.append(key, value);
    });
    return urlObj.href;
  } catch {
    return base;
  }
}

export function getCanonicalURL(url: string): string {
  return normalizeURL(url, {
    removeFragment: true,
    sortQueryParams: true,
    removeTrailingSlash: true,
  });
}

export function urlToFingerprint(url: string): string {
  const normalized = getCanonicalURL(url);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(16);
}
