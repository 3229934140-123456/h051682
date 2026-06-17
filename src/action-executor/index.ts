import type { DOMNode, ElementNode, Action, ActionType } from '../types';
import { querySelector, querySelectorAll } from '../css-selector';
import { textContent } from '../html-parser';

export interface ActionContext {
  dom: DOMNode;
  variables: Record<string, unknown>;
  results: Record<string, unknown>;
  currentUrl: string;
  delay: (ms: number) => Promise<void>;
}

export interface ActionResult {
  success: boolean;
  action: Action;
  result?: unknown;
  error?: string;
  duration: number;
}

export interface ExecutorOptions {
  defaultDelay?: number;
  retryCount?: number;
  retryDelay?: number;
}

export class ActionExecutor {
  private handlers: Map<ActionType, (action: Action, context: ActionContext) => Promise<unknown>>;
  private options: Required<ExecutorOptions>;

  constructor(options: ExecutorOptions = {}) {
    this.options = {
      defaultDelay: options.defaultDelay ?? 100,
      retryCount: options.retryCount ?? 2,
      retryDelay: options.retryDelay ?? 500,
    };

    this.handlers = new Map();
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    this.handlers.set('click', this.handleClick.bind(this));
    this.handlers.set('type', this.handleType.bind(this));
    this.handlers.set('select', this.handleSelect.bind(this));
    this.handlers.set('scroll', this.handleScroll.bind(this));
    this.handlers.set('hover', this.handleHover.bind(this));
    this.handlers.set('focus', this.handleFocus.bind(this));
    this.handlers.set('blur', this.handleBlur.bind(this));
    this.handlers.set('submit', this.handleSubmit.bind(this));
    this.handlers.set('wait', this.handleWait.bind(this));
    this.handlers.set('evaluate', this.handleEvaluate.bind(this));
  }

  public registerHandler(
    type: ActionType,
    handler: (action: Action, context: ActionContext) => Promise<unknown>
  ): void {
    this.handlers.set(type, handler);
  }

  public async execute(
    actions: Action[],
    context: ActionContext
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      const result = await this.executeWithRetry(action, context);
      results.push(result);

      if (!result.success) {
        const continueOnError = action.options?.continueOnError as boolean | undefined;
        if (!continueOnError) {
          break;
        }
      }

      const delay = action.delay ?? this.options.defaultDelay;
      if (delay > 0) {
        await context.delay(delay);
      }
    }

    return results;
  }

  private async executeWithRetry(
    action: Action,
    context: ActionContext
  ): Promise<ActionResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.retryCount; attempt++) {
      try {
        const result = await this.executeSingle(action, context);
        return {
          success: true,
          action,
          result,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.retryCount) {
          await context.delay(this.options.retryDelay * (attempt + 1));
        }
      }
    }

    return {
      success: false,
      action,
      error: lastError?.message ?? 'Unknown error',
      duration: Date.now() - startTime,
    };
  }

  private async executeSingle(action: Action, context: ActionContext): Promise<unknown> {
    const handler = this.handlers.get(action.type);
    if (!handler) {
      throw new Error(`No handler registered for action type: ${action.type}`);
    }

    return handler(action, context);
  }

  private findElement(context: ActionContext, selector?: string): ElementNode {
    if (!selector) {
      throw new Error('Selector is required for this action');
    }

    const element = querySelector(context.dom, selector);
    if (!element) {
      throw new Error(`Element not found for selector: ${selector}`);
    }

    return element;
  }

  private findElements(context: ActionContext, selector?: string): ElementNode[] {
    if (!selector) {
      throw new Error('Selector is required for this action');
    }

    const elements = querySelectorAll(context.dom, selector);
    if (elements.length === 0) {
      throw new Error(`No elements found for selector: ${selector}`);
    }

    return elements;
  }

  private async handleClick(action: Action, context: ActionContext): Promise<unknown> {
    const element = this.findElement(context, action.selector);

    this.simulateEvent(element, 'mousedown');
    this.simulateEvent(element, 'mouseup');
    this.simulateEvent(element, 'click');

    const tagName = element.tagName?.toLowerCase();
    if (tagName === 'a') {
      const href = element.attributes.href;
      if (href) {
        context.results['clickedUrl'] = href;
        return { clicked: true, href };
      }
    }

    if (tagName === 'input' || tagName === 'button') {
      const type = element.attributes.type?.toLowerCase();
      if (type === 'submit') {
        return { clicked: true, submitted: true };
      }
    }

    return { clicked: true, element };
  }

  private async handleType(action: Action, context: ActionContext): Promise<unknown> {
    const element = this.findElement(context, action.selector);
    const value = String(action.value ?? '');

    const tagName = element.tagName?.toLowerCase();
    const inputType = element.attributes.type?.toLowerCase();

    if (
      tagName !== 'input' &&
      tagName !== 'textarea' &&
      !element.attributes.contenteditable
    ) {
      throw new Error(`Cannot type into element: ${tagName}`);
    }

    if (inputType === 'file') {
      throw new Error('File input type not supported');
    }

    element.attributes.value = value;

    if (tagName === 'textarea') {
      element.children = [
        {
          nodeType: 3,
          textContent: value,
          attributes: {},
          children: [],
          parent: element,
          childIndex: 0,
        },
      ];
    }

    this.simulateEvent(element, 'input');
    this.simulateEvent(element, 'change');

    return { typed: true, value };
  }

  private async handleSelect(action: Action, context: ActionContext): Promise<unknown> {
    const element = this.findElement(context, action.selector);
    const value = String(action.value ?? '');

    if (element.tagName?.toLowerCase() !== 'select') {
      throw new Error('Cannot select on non-select element');
    }

    const options = querySelectorAll(element, 'option');
    let selected = false;

    for (const option of options) {
      if (option.attributes.value === value || textContent(option).trim() === value) {
        option.attributes.selected = 'selected';
        selected = true;
      } else {
        delete option.attributes.selected;
      }
    }

    if (!selected) {
      throw new Error(`Option not found: ${value}`);
    }

    element.attributes.value = value;
    this.simulateEvent(element, 'change');

    return { selected: true, value };
  }

  private async handleScroll(action: Action, context: ActionContext): Promise<unknown> {
    const x = (action.options?.x as number) ?? 0;
    const y = (action.options?.y as number) ?? 0;

    if (action.selector) {
      const element = this.findElement(context, action.selector);
      return { scrolled: true, element, x, y };
    }

    return { scrolled: true, x, y };
  }

  private async handleHover(action: Action, context: ActionContext): Promise<unknown> {
    const element = this.findElement(context, action.selector);

    this.simulateEvent(element, 'mouseenter');
    this.simulateEvent(element, 'mouseover');

    return { hovered: true, element };
  }

  private async handleFocus(action: Action, context: ActionContext): Promise<unknown> {
    const element = this.findElement(context, action.selector);
    this.simulateEvent(element, 'focus');

    return { focused: true, element };
  }

  private async handleBlur(action: Action, context: ActionContext): Promise<unknown> {
    const element = this.findElement(context, action.selector);
    this.simulateEvent(element, 'blur');

    return { blurred: true, element };
  }

  private async handleSubmit(action: Action, context: ActionContext): Promise<unknown> {
    const element = this.findElement(context, action.selector);

    if (element.tagName?.toLowerCase() !== 'form') {
      throw new Error('Cannot submit non-form element');
    }

    this.simulateEvent(element, 'submit');

    return { submitted: true, form: element };
  }

  private async handleWait(action: Action, context: ActionContext): Promise<unknown> {
    const waitMs = (action.value as number) ?? 1000;

    if (action.selector) {
      const timeout = Date.now() + waitMs;
      while (Date.now() < timeout) {
        try {
          const element = querySelector(context.dom, action.selector);
          if (element) {
            return { waited: true, found: true, selector: action.selector };
          }
        } catch {
          // ignore
        }
        await context.delay(100);
      }
      throw new Error(`Timeout waiting for selector: ${action.selector}`);
    }

    await context.delay(waitMs);
    return { waited: true, duration: waitMs };
  }

  private async handleEvaluate(action: Action, context: ActionContext): Promise<unknown> {
    const script = action.value as string;
    if (!script) {
      throw new Error('Script is required for evaluate action');
    }

    try {
      const elements = action.selector ? this.findElements(context, action.selector) : [];
      const fn = new Function(
        'elements',
        'context',
        'querySelector',
        'querySelectorAll',
        'textContent',
        `"use strict"; return (${script})(elements, context, querySelector, querySelectorAll, textContent)`
      );

      const result = fn(
        elements,
        context,
        (sel: string) => querySelector(context.dom, sel),
        (sel: string) => querySelectorAll(context.dom, sel),
        textContent
      );

      return { evaluated: true, result };
    } catch (error) {
      throw new Error(`Evaluation error: ${(error as Error).message}`);
    }
  }

  private simulateEvent(element: ElementNode, eventName: string): void {
    if (!element.attributes['data-events']) {
      element.attributes['data-events'] = '';
    }
    const events = element.attributes['data-events'];
    element.attributes['data-events'] = events ? `${events},${eventName}` : eventName;
  }
}

export function createActionSequence(actions: Action[]): Action[] {
  return actions;
}

export function click(selector: string, options: Partial<Action> = {}): Action {
  return { type: 'click', selector, ...options };
}

export function typeText(
  selector: string,
  value: string,
  options: Partial<Action> = {}
): Action {
  return { type: 'type', selector, value, ...options };
}

export function selectOption(
  selector: string,
  value: string,
  options: Partial<Action> = {}
): Action {
  return { type: 'select', selector, value, ...options };
}

export function scrollTo(
  x: number,
  y: number,
  selector?: string,
  options: Partial<Action> = {}
): Action {
  return { type: 'scroll', selector, options: { x, y, ...options.options }, ...options };
}

export function waitFor(
  selectorOrMs: string | number,
  options: Partial<Action> = {}
): Action {
  if (typeof selectorOrMs === 'number') {
    return { type: 'wait', value: selectorOrMs, ...options };
  }
  return { type: 'wait', selector: selectorOrMs, value: 5000, ...options };
}

export function hover(selector: string, options: Partial<Action> = {}): Action {
  return { type: 'hover', selector, ...options };
}

export function evaluate(
  script: string,
  selector?: string,
  options: Partial<Action> = {}
): Action {
  return { type: 'evaluate', value: script, selector, ...options };
}
