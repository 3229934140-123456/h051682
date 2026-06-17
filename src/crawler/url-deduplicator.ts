export interface URLDeduplicatorOptions {
  useFingerprint?: boolean;
  normalizeURL?: boolean;
  maxSize?: number;
}

export interface URLRecord {
  url: string;
  normalizedURL: string;
  fingerprint: string;
  visitedAt: number;
  status: 'pending' | 'visited' | 'failed';
  depth: number;
}

export class URLDeduplicator {
  private seenURLs: Set<string> = new Set();
  private seenFingerprints: Set<string> = new Set();
  private urlRecords: Map<string, URLRecord> = new Map();
  private options: Required<URLDeduplicatorOptions>;

  constructor(options: URLDeduplicatorOptions = {}) {
    this.options = {
      useFingerprint: options.useFingerprint ?? true,
      normalizeURL: options.normalizeURL ?? true,
      maxSize: options.maxSize ?? 100000,
    };
  }

  public isSeen(url: string, normalizedURL?: string, fingerprint?: string): boolean {
    if (this.options.normalizeURL && normalizedURL) {
      if (this.seenURLs.has(normalizedURL)) {
        return true;
      }
    } else if (this.seenURLs.has(url)) {
      return true;
    }

    if (this.options.useFingerprint && fingerprint) {
      if (this.seenFingerprints.has(fingerprint)) {
        return true;
      }
    }

    return false;
  }

  public markAsSeen(
    url: string,
    normalizedURL: string,
    fingerprint: string,
    depth: number,
    status: URLRecord['status'] = 'visited'
  ): boolean {
    if (this.isSeen(url, normalizedURL, fingerprint)) {
      return false;
    }

    if (this.urlRecords.size >= this.options.maxSize) {
      this.evictOldest();
    }

    this.seenURLs.add(normalizedURL);
    this.seenFingerprints.add(fingerprint);

    this.urlRecords.set(normalizedURL, {
      url,
      normalizedURL,
      fingerprint,
      visitedAt: Date.now(),
      status,
      depth,
    });

    return true;
  }

  public markAsPending(url: string, normalizedURL: string, fingerprint: string, depth: number): boolean {
    return this.markAsSeen(url, normalizedURL, fingerprint, depth, 'pending');
  }

  public markAsFailed(url: string, normalizedURL: string): void {
    const record = this.urlRecords.get(normalizedURL);
    if (record) {
      record.status = 'failed';
      record.visitedAt = Date.now();
    }
  }

  public markAsVisited(url: string, normalizedURL: string): void {
    const record = this.urlRecords.get(normalizedURL);
    if (record) {
      record.status = 'visited';
      record.visitedAt = Date.now();
    }
  }

  public getRecord(normalizedURL: string): URLRecord | undefined {
    return this.urlRecords.get(normalizedURL);
  }

  public getCount(): number {
    return this.seenURLs.size;
  }

  public getVisitedCount(): number {
    let count = 0;
    for (const record of this.urlRecords.values()) {
      if (record.status === 'visited') {
        count++;
      }
    }
    return count;
  }

  public getFailedCount(): number {
    let count = 0;
    for (const record of this.urlRecords.values()) {
      if (record.status === 'failed') {
        count++;
      }
    }
    return count;
  }

  public clear(): void {
    this.seenURLs.clear();
    this.seenFingerprints.clear();
    this.urlRecords.clear();
  }

  public getAllURLs(): string[] {
    return Array.from(this.urlRecords.keys());
  }

  public getStats(): {
    total: number;
    visited: number;
    failed: number;
    pending: number;
  } {
    let visited = 0;
    let failed = 0;
    let pending = 0;

    for (const record of this.urlRecords.values()) {
      if (record.status === 'visited') visited++;
      else if (record.status === 'failed') failed++;
      else if (record.status === 'pending') pending++;
    }

    return {
      total: this.urlRecords.size,
      visited,
      failed,
      pending,
    };
  }

  private evictOldest(): void {
    const sorted = Array.from(this.urlRecords.entries()).sort(
      (a, b) => a[1].visitedAt - b[1].visitedAt
    );

    const toRemove = sorted.slice(0, Math.floor(sorted.length * 0.1));

    for (const [key, record] of toRemove) {
      this.seenURLs.delete(key);
      this.seenFingerprints.delete(record.fingerprint);
      this.urlRecords.delete(key);
    }
  }

  public export(): string {
    return JSON.stringify({
      seenURLs: Array.from(this.seenURLs),
      seenFingerprints: Array.from(this.seenFingerprints),
      urlRecords: Array.from(this.urlRecords.entries()),
    });
  }

  public import(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.seenURLs = new Set(parsed.seenURLs || []);
      this.seenFingerprints = new Set(parsed.seenFingerprints || []);
      this.urlRecords = new Map(parsed.urlRecords || []);
    } catch (e) {
      throw new Error(`Failed to import deduplicator data: ${(e as Error).message}`);
    }
  }
}

export function createURLDeduplicator(
  options: URLDeduplicatorOptions = {}
): URLDeduplicator {
  return new URLDeduplicator(options);
}
