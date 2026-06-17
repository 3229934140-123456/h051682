import type { DOMNode, ElementNode, ExtractionRule, ExtractionSchema, ExtractionResult } from '../types';
import { querySelector, querySelectorAll, matches } from '../css-selector';
import { textContent, innerHTML, outerHTML } from '../html-parser';

const SELF_SELECTOR = '&self';

export interface ExtractionContext {
  dom: DOMNode;
  baseUrl: string;
  variables: Record<string, unknown>;
}

export class DataExtractor {
  public extract(
    context: ExtractionContext,
    schema: ExtractionSchema
  ): ExtractionResult {
    return this.extractSchema(context, schema);
  }

  public extractRule(
    context: ExtractionContext,
    rule: ExtractionRule
  ): unknown {
    const elements = this.resolveElements(context, rule.selector);

    if (elements.length === 0) {
      return rule.multiple ? [] : rule.defaultValue;
    }

    if (rule.multiple) {
      return elements.map((el) => this.extractSingle(context, el, rule));
    }

    return this.extractSingle(context, elements[0], rule);
  }

  private resolveElements(context: ExtractionContext, selector: string): ElementNode[] {
    if (selector === SELF_SELECTOR) {
      if (context.dom.nodeType === 1) {
        return [context.dom as ElementNode];
      }
      return [];
    }

    const descendants = querySelectorAll(context.dom, selector);

    if (
      context.dom.nodeType === 1 &&
      descendants.length === 0 &&
      !selector.includes(' ') &&
      !selector.includes('>') &&
      !selector.includes('+') &&
      !selector.includes('~')
    ) {
      const el = context.dom as ElementNode;
      if (matches(el, selector)) {
        return [el];
      }
    }

    return descendants;
  }

  private extractSchema(
    context: ExtractionContext,
    schema: ExtractionSchema
  ): ExtractionResult {
    const result: ExtractionResult = {};

    for (const [key, value] of Object.entries(schema)) {
      if (this.isExtractionRule(value)) {
        result[key] = this.extractRule(context, value);
      } else if (this.isSchema(value)) {
        result[key] = this.extractSchema(context, value);
      }
    }

    return result;
  }

  private isExtractionRule(value: unknown): value is ExtractionRule {
    return (
      typeof value === 'object' &&
      value !== null &&
      'selector' in value &&
      'extract' in value
    );
  }

  private isSchema(value: unknown): value is ExtractionSchema {
    return typeof value === 'object' && value !== null && !('selector' in value);
  }

  private extractSingle(
    context: ExtractionContext,
    element: ElementNode,
    rule: ExtractionRule
  ): unknown {
    let value: unknown;

    switch (rule.extract) {
      case 'self':
        value = this.extractSelfProperties(element);
        break;
      case 'text':
        value = textContent(element).trim();
        break;
      case 'html':
        value = innerHTML(element);
        break;
      case 'attr':
        value = rule.attrName ? element.attributes[rule.attrName] : undefined;
        break;
      case 'prop':
        value = this.getProperty(element, rule.attrName || '');
        break;
      case 'data':
        value = rule.dataKey ? this.getDataAttribute(element, rule.dataKey) : this.getAllDataAttributes(element);
        break;
      default:
        value = undefined;
    }

    if (value === undefined || value === null || value === '') {
      value = rule.defaultValue;
    }

    if (rule.transform && value !== undefined) {
      value = rule.transform(value);
    }

    if (rule.nested) {
      const nestedContext: ExtractionContext = {
        ...context,
        dom: element,
      };
      const nestedResult = this.extractSchema(nestedContext, rule.nested);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        value = { ...(value as Record<string, unknown>), ...nestedResult };
      } else {
        value = nestedResult;
      }
    }

    return value;
  }

  private extractSelfProperties(element: ElementNode): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    result.tagName = element.tagName?.toLowerCase() || '';
    result.id = element.attributes.id || '';

    const classStr = element.attributes.class || '';
    result.className = classStr;
    result.classList = classStr.split(/\s+/).filter(Boolean);

    for (const [key, val] of Object.entries(element.attributes)) {
      if (key !== 'id' && key !== 'class') {
        result[key] = val;
      }
    }

    const dataAttrs: Record<string, string> = {};
    for (const [key, val] of Object.entries(element.attributes)) {
      if (key.startsWith('data-')) {
        const dataKey = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        dataAttrs[dataKey] = val;
      }
    }
    if (Object.keys(dataAttrs).length > 0) {
      result.data = dataAttrs;
    }

    return result;
  }

  private getProperty(element: ElementNode, propName: string): unknown {
    const tagName = element.tagName?.toLowerCase();

    switch (propName) {
      case 'tagName':
        return element.tagName;
      case 'text':
      case 'textContent':
        return textContent(element).trim();
      case 'innerHTML':
        return innerHTML(element);
      case 'outerHTML':
        return outerHTML(element);
      case 'value':
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
          return element.attributes.value || textContent(element).trim();
        }
        return element.attributes.value;
      case 'checked':
        return element.attributes.checked !== undefined;
      case 'selected':
        return element.attributes.selected !== undefined;
      case 'disabled':
        return element.attributes.disabled !== undefined;
      case 'href':
      case 'src':
      case 'action':
      case 'formaction':
        return element.attributes[propName];
      case 'class':
      case 'className':
        return element.attributes.class || '';
      case 'classList':
        return (element.attributes.class || '').split(/\s+/).filter(Boolean);
      case 'id':
        return element.attributes.id || '';
      case 'title':
        return element.attributes.title || '';
      case 'alt':
        return element.attributes.alt || '';
      case 'placeholder':
        return element.attributes.placeholder || '';
      case 'name':
        return element.attributes.name || '';
      case 'type':
        return element.attributes.type || (tagName === 'input' ? 'text' : tagName);
      default:
        return element.attributes[propName];
    }
  }

  private getDataAttribute(element: ElementNode, key: string): string | undefined {
    return element.attributes[`data-${key}`];
  }

  private getAllDataAttributes(element: ElementNode): Record<string, string> {
    const data: Record<string, string> = {};

    for (const [key, value] of Object.entries(element.attributes)) {
      if (key.startsWith('data-')) {
        const dataKey = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        data[dataKey] = value;
      }
    }

    return data;
  }
}

export function createExtractionRule(
  name: string,
  selector: string,
  extract: ExtractionRule['extract'],
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return {
    name,
    selector,
    extract,
    ...options,
  };
}

export function textRule(
  name: string,
  selector: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, selector, 'text', options);
}

export function htmlRule(
  name: string,
  selector: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, selector, 'html', options);
}

export function attrRule(
  name: string,
  selector: string,
  attrName: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, selector, 'attr', { attrName, ...options });
}

export function dataRule(
  name: string,
  selector: string,
  dataKey?: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, selector, 'data', { dataKey, ...options });
}

export function propRule(
  name: string,
  selector: string,
  attrName: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, selector, 'prop', { attrName, ...options });
}

export function selfRule(
  name: string,
  selector: string = '&self',
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, selector, 'self', options);
}

export function selfAttrRule(
  name: string,
  attrName: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, '&self', 'attr', { attrName, ...options });
}

export function selfDataRule(
  name: string,
  dataKey: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, '&self', 'data', { dataKey, ...options });
}

export function selfPropRule(
  name: string,
  propName: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, '&self', 'prop', { attrName: propName, ...options });
}

export function listRule(
  name: string,
  selector: string,
  nested: Record<string, ExtractionRule>,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return createExtractionRule(name, selector, 'self', {
    multiple: true,
    nested,
    ...options,
  });
}

export function linkRule(
  name: string,
  selector: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return attrRule(name, selector, 'href', {
    transform: (value) => value as string,
    ...options,
  });
}

export function imageRule(
  name: string,
  selector: string,
  options: Partial<ExtractionRule> = {}
): ExtractionRule {
  return attrRule(name, selector, 'src', options);
}

export function createSchema(rules: Record<string, ExtractionRule | ExtractionSchema>): ExtractionSchema {
  return rules;
}
