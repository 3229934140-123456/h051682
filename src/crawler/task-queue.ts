import type { CrawlTask } from '../types';

export interface TaskQueueOptions {
  strategy?: 'fifo' | 'lifo' | 'priority';
  maxSize?: number;
}

export class TaskQueue {
  private tasks: CrawlTask[] = [];
  private strategy: 'fifo' | 'lifo' | 'priority';
  private maxSize: number;

  constructor(options: TaskQueueOptions = {}) {
    this.strategy = options.strategy ?? 'fifo';
    this.maxSize = options.maxSize ?? 10000;
  }

  public enqueue(task: CrawlTask): boolean {
    if (this.isFull()) {
      return false;
    }

    this.tasks.push(task);

    if (this.strategy === 'priority') {
      this.tasks.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt - b.createdAt;
      });
    }

    return true;
  }

  public dequeue(): CrawlTask | null {
    if (this.isEmpty()) {
      return null;
    }

    let task: CrawlTask | undefined;

    switch (this.strategy) {
      case 'fifo':
      case 'priority':
        task = this.tasks.shift();
        break;
      case 'lifo':
        task = this.tasks.pop();
        break;
    }

    return task ?? null;
  }

  public peek(): CrawlTask | null {
    if (this.isEmpty()) {
      return null;
    }

    switch (this.strategy) {
      case 'fifo':
      case 'priority':
        return this.tasks[0];
      case 'lifo':
        return this.tasks[this.tasks.length - 1];
    }
  }

  public isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  public isFull(): boolean {
    return this.tasks.length >= this.maxSize;
  }

  public size(): number {
    return this.tasks.length;
  }

  public clear(): void {
    this.tasks = [];
  }

  public getAllTasks(): CrawlTask[] {
    return [...this.tasks];
  }

  public getTasksByStatus(status: CrawlTask['status']): CrawlTask[] {
    return this.tasks.filter((t) => t.status === status);
  }

  public getTasksByDepth(depth: number): CrawlTask[] {
    return this.tasks.filter((t) => t.depth === depth);
  }

  public removeById(id: string): boolean {
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index !== -1) {
      this.tasks.splice(index, 1);
      return true;
    }
    return false;
  }

  public findById(id: string): CrawlTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  public updateTask(id: string, updates: Partial<CrawlTask>): boolean {
    const task = this.findById(id);
    if (task) {
      Object.assign(task, updates);
      return true;
    }
    return false;
  }

  public getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byDepth: Record<number, number>;
  } {
    const stats = {
      total: this.tasks.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      byDepth: {} as Record<number, number>,
    };

    for (const task of this.tasks) {
      stats[task.status]++;
      stats.byDepth[task.depth] = (stats.byDepth[task.depth] || 0) + 1;
    }

    return stats;
  }

  public setStrategy(strategy: 'fifo' | 'lifo' | 'priority'): void {
    this.strategy = strategy;
    if (strategy === 'priority') {
      this.tasks.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt - b.createdAt;
      });
    }
  }

  public getStrategy(): string {
    return this.strategy;
  }
}

export function createTaskQueue(
  options: TaskQueueOptions = {}
): TaskQueue {
  return new TaskQueue(options);
}
