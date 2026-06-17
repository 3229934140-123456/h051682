import type {
  DOMNode,
  ElementNode,
  CSSSelector,
  CSSSelectorPart,
  CSSCombinator,
} from '../types';

const SELF_SELECTOR = '&self';

export class SelectorParser {
  private pos: number = 0;
  private input: string = '';

  public parse(selector: string): CSSSelector {
    this.pos = 0;
    this.input = selector.trim();

    const parts: CSSSelectorPart[] = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.pos >= this.input.length) break;

      let combinator: CSSCombinator | undefined;
      if (parts.length > 0) {
        combinator = ' ';
        const saved = this.pos;
        const nextChar = this.input[this.pos];

        if (nextChar === '>' || nextChar === '+' || nextChar === '~') {
          combinator = nextChar as CSSCombinator;
          this.pos++;
          this.skipWhitespace();
        }
      }

      const part = this.readCompoundSelector();
      if (!this.hasPartContent(part)) break;

      part.combinator = combinator;
      parts.push(part);
    }

    return {
      parts,
      specificity: this.calculateSpecificity(parts),
    };
  }

  private readCompoundSelector(): CSSSelectorPart {
    const part: CSSSelectorPart = {
      classNames: [],
      attributes: [],
      pseudoClasses: [],
    };

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      if (char === ' ' || char === '>' || char === '+' || char === '~' || char === ',') {
        break;
      }

      if (char === '*') {
        part.tagName = '*';
        this.pos++;
      } else if (char === '#') {
        this.pos++;
        part.id = this.readIdentifier();
      } else if (char === '.') {
        this.pos++;
        part.classNames.push(this.readIdentifier());
      } else if (char === '[') {
        part.attributes.push(this.readAttribute());
      } else if (char === ':') {
        if (this.input[this.pos + 1] === ':') {
          this.pos += 2;
          part.pseudoClasses.push({ name: `::${this.readIdentifier()}` });
        } else {
          this.pos++;
          part.pseudoClasses.push(this.readPseudoClass());
        }
      } else if (/[a-zA-Z]/.test(char)) {
        part.tagName = this.readTagName();
      } else {
        this.pos++;
      }
    }

    return part;
  }

  private createEmptyPart(): CSSSelectorPart {
    return {
      classNames: [],
      attributes: [],
      pseudoClasses: [],
    };
  }

  private hasPartContent(part: CSSSelectorPart): boolean {
    return !!(
      part.tagName ||
      part.id ||
      part.classNames.length > 0 ||
      part.attributes.length > 0 ||
      part.pseudoClasses.length > 0
    );
  }

  private readTagName(): string {
    const match = this.input.slice(this.pos).match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    if (match) {
      this.pos += match[1].length;
      return match[1].toUpperCase();
    }
    return '';
  }

  private readIdentifier(): string {
    const match = this.input.slice(this.pos).match(/^([a-zA-Z0-9_-]+)/);
    if (match) {
      this.pos += match[1].length;
      return match[1];
    }
    return '';
  }

  private readAttribute(): CSSSelectorPart['attributes'][0] {
    this.pos++;

    const nameMatch = this.input.slice(this.pos).match(/^([a-zA-Z_][a-zA-Z0-9_-]*)/);
    if (!nameMatch) {
      const bracketEnd = this.input.indexOf(']', this.pos);
      if (bracketEnd !== -1) {
        this.pos = bracketEnd + 1;
      }
      return { name: '' };
    }

    const name = nameMatch[1];
    this.pos += name.length;

    this.skipWhitespace();

    const operatorMatch = this.input.slice(this.pos).match(/^([~|^$*]?=)/);
    if (!operatorMatch) {
      if (this.input[this.pos] === ']') {
        this.pos++;
        return { name };
      }
      const bracketEnd = this.input.indexOf(']', this.pos);
      if (bracketEnd !== -1) {
        this.pos = bracketEnd + 1;
      }
      return { name };
    }

    const operator = operatorMatch[1] as CSSSelectorPart['attributes'][0]['operator'];
    this.pos += operator!.length;

    this.skipWhitespace();

    let value = '';
    const quoteChar = this.input[this.pos];
    if (quoteChar === '"' || quoteChar === "'") {
      this.pos++;
      const valueEnd = this.input.indexOf(quoteChar, this.pos);
      if (valueEnd !== -1) {
        value = this.input.slice(this.pos, valueEnd);
        this.pos = valueEnd + 1;
      }
    } else {
      const valueMatch = this.input.slice(this.pos).match(/^([^\]]+)/);
      if (valueMatch) {
        value = valueMatch[1].trim();
        this.pos += valueMatch[1].length;
      }
    }

    if (this.input[this.pos] === ']') {
      this.pos++;
    }

    return { name, operator, value };
  }

  private readPseudoClass(): CSSSelectorPart['pseudoClasses'][0] {
    const name = this.readIdentifier();

    if (this.input[this.pos] === '(') {
      this.pos++;
      const parenEnd = this.findMatchingParen();
      const argument = this.input.slice(this.pos, parenEnd).trim();
      this.pos = parenEnd + 1;
      return { name, argument };
    }

    return { name };
  }

  private findMatchingParen(): number {
    let depth = 1;
    let pos = this.pos;

    while (pos < this.input.length && depth > 0) {
      if (this.input[pos] === '(') depth++;
      else if (this.input[pos] === ')') depth--;
      pos++;
    }

    return pos - 1;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private calculateSpecificity(parts: CSSSelectorPart[]): number {
    let a = 0;
    let b = 0;
    let c = 0;

    for (const part of parts) {
      if (part.id) a++;
      b += part.classNames.length + part.attributes.length;
      for (const pseudo of part.pseudoClasses) {
        if (pseudo.name === 'not' || pseudo.name === 'is' || pseudo.name === 'where') {
          continue;
        }
        if (pseudo.name.startsWith('::')) {
          c++;
        } else {
          b++;
        }
      }
      if (part.tagName && part.tagName !== '*') c++;
    }

    return a * 10000 + b * 100 + c;
  }
}

export class SelectorMatcher {
  private parser: SelectorParser = new SelectorParser();

  public matches(element: ElementNode, selector: string): boolean {
    if (selector === SELF_SELECTOR) return true;
    const parsed = this.parser.parse(selector);
    return this.matchSelector(element, parsed);
  }

  public querySelector(root: DOMNode, selector: string): ElementNode | null {
    const results = this.querySelectorAll(root, selector);
    return results.length > 0 ? results[0] : null;
  }

  public querySelectorAll(root: DOMNode, selector: string): ElementNode[] {
    if (selector === SELF_SELECTOR) {
      if (root.nodeType === 1) return [root as ElementNode];
      return [];
    }

    const selectors = selector.split(',').map(s => s.trim()).filter(Boolean);
    const allResults: Set<ElementNode> = new Set();

    for (const sel of selectors) {
      const parsed = this.parser.parse(sel);
      const results = this.matchSelectorAll(root, parsed);
      results.forEach(r => allResults.add(r));
    }

    return Array.from(allResults);
  }

  private matchSelector(element: ElementNode, selector: CSSSelector): boolean {
    if (selector.parts.length === 0) return false;

    return this.matchSelectorParts(element, selector.parts, selector.parts.length - 1);
  }

  private matchSelectorParts(
    element: ElementNode,
    parts: CSSSelectorPart[],
    partIndex: number
  ): boolean {
    if (partIndex < 0) return true;

    const currentPart = parts[partIndex];

    if (!this.matchSimpleSelector(element, currentPart)) {
      return false;
    }

    if (partIndex === 0) return true;

    const combinator = currentPart.combinator || ' ';

    return this.matchCombinator(element, parts, partIndex - 1, combinator);
  }

  private matchCombinator(
    element: ElementNode,
    parts: CSSSelectorPart[],
    targetIndex: number,
    combinator: CSSCombinator
  ): boolean {
    switch (combinator) {
      case ' ':
        return this.matchDescendant(element, parts, targetIndex);
      case '>':
        return this.matchChild(element, parts, targetIndex);
      case '+':
        return this.matchAdjacentSibling(element, parts, targetIndex);
      case '~':
        return this.matchGeneralSibling(element, parts, targetIndex);
      default:
        return false;
    }
  }

  private matchDescendant(
    element: ElementNode,
    parts: CSSSelectorPart[],
    targetIndex: number
  ): boolean {
    let parent = element.parent;
    while (parent) {
      if (parent.nodeType === 1) {
        if (this.matchSimpleSelector(parent as ElementNode, parts[targetIndex])) {
          if (targetIndex === 0 || this.matchSelectorParts(parent as ElementNode, parts, targetIndex)) {
            return true;
          }
        }
      }
      parent = parent.parent;
    }
    return false;
  }

  private matchChild(
    element: ElementNode,
    parts: CSSSelectorPart[],
    targetIndex: number
  ): boolean {
    const parent = element.parent;
    if (!parent || parent.nodeType !== 1) return false;

    if (!this.matchSimpleSelector(parent as ElementNode, parts[targetIndex])) return false;

    if (targetIndex === 0) return true;

    return this.matchSelectorParts(parent as ElementNode, parts, targetIndex);
  }

  private matchAdjacentSibling(
    element: ElementNode,
    parts: CSSSelectorPart[],
    targetIndex: number
  ): boolean {
    const sibling = this.getPreviousElementSibling(element);
    if (!sibling) return false;

    if (!this.matchSimpleSelector(sibling, parts[targetIndex])) return false;

    if (targetIndex === 0) return true;

    return this.matchSelectorParts(sibling, parts, targetIndex);
  }

  private matchGeneralSibling(
    element: ElementNode,
    parts: CSSSelectorPart[],
    targetIndex: number
  ): boolean {
    let sibling = this.getPreviousElementSibling(element);
    while (sibling) {
      if (this.matchSimpleSelector(sibling, parts[targetIndex])) {
        if (targetIndex === 0 || this.matchSelectorParts(sibling, parts, targetIndex)) {
          return true;
        }
      }
      sibling = this.getPreviousElementSibling(sibling);
    }
    return false;
  }

  private getPreviousElementSibling(node: DOMNode): ElementNode | null {
    if (!node.parent) return null;
    for (let i = node.childIndex - 1; i >= 0; i--) {
      const sibling = node.parent.children[i];
      if (sibling.nodeType === 1) return sibling as ElementNode;
    }
    return null;
  }

  private getNextElementSibling(node: DOMNode): ElementNode | null {
    if (!node.parent) return null;
    for (let i = node.childIndex + 1; i < node.parent.children.length; i++) {
      const sibling = node.parent.children[i];
      if (sibling.nodeType === 1) return sibling as ElementNode;
    }
    return null;
  }

  private getElementChildIndex(element: ElementNode): number {
    if (!element.parent) return 1;
    let index = 0;
    for (let i = 0; i < element.childIndex; i++) {
      if (element.parent.children[i].nodeType === 1) index++;
    }
    return index + 1;
  }

  private getElementCount(parent: DOMNode): number {
    let count = 0;
    for (const child of parent.children) {
      if (child.nodeType === 1) count++;
    }
    return count;
  }

  private matchSimpleSelector(element: ElementNode, part: CSSSelectorPart): boolean {
    if (part.tagName && part.tagName !== '*' && element.tagName !== part.tagName) {
      return false;
    }

    if (part.id && element.attributes.id !== part.id) {
      return false;
    }

    if (part.classNames.length > 0) {
      const elementClasses = (element.attributes.class || '').split(/\s+/).filter(Boolean);
      for (const className of part.classNames) {
        if (!elementClasses.includes(className)) {
          return false;
        }
      }
    }

    for (const attr of part.attributes) {
      if (!this.matchAttribute(element, attr)) {
        return false;
      }
    }

    for (const pseudo of part.pseudoClasses) {
      if (!this.matchPseudoClass(element, pseudo)) {
        return false;
      }
    }

    return true;
  }

  private matchAttribute(
    element: ElementNode,
    attr: CSSSelectorPart['attributes'][0]
  ): boolean {
    const value = element.attributes[attr.name];

    if (!attr.operator) {
      return value !== undefined;
    }

    if (value === undefined) return false;
    const attrValue = attr.value || '';

    switch (attr.operator) {
      case '=':
        return value === attrValue;
      case '~=':
        return value.split(/\s+/).includes(attrValue);
      case '|=':
        return value === attrValue || value.startsWith(attrValue + '-');
      case '^=':
        return value.startsWith(attrValue);
      case '$=':
        return value.endsWith(attrValue);
      case '*=':
        return value.includes(attrValue);
      default:
        return false;
    }
  }

  private matchPseudoClass(
    element: ElementNode,
    pseudo: CSSSelectorPart['pseudoClasses'][0]
  ): boolean {
    const name = pseudo.name.toLowerCase();
    const arg = pseudo.argument;

    switch (name) {
      case 'first-child':
        return this.getPreviousElementSibling(element) === null;
      case 'last-child':
        return this.getNextElementSibling(element) === null;
      case 'only-child':
        return (
          this.getPreviousElementSibling(element) === null && this.getNextElementSibling(element) === null
        );
      case 'nth-child':
        return this.matchNthChild(element, arg || '');
      case 'nth-last-child':
        return this.matchNthLastChild(element, arg || '');
      case 'nth-of-type':
        return this.matchNthOfType(element, arg || '');
      case 'nth-last-of-type':
        return this.matchNthLastOfType(element, arg || '');
      case 'first-of-type':
        return this.matchNthOfType(element, '1');
      case 'last-of-type':
        return this.matchNthLastOfType(element, '1');
      case 'only-of-type':
        return (
          this.matchNthOfType(element, '1') && this.matchNthLastOfType(element, '1')
        );
      case 'empty':
        return this.isEmpty(element);
      case 'not':
        return !this.matches(element, arg || '');
      case 'has':
        return this.matchHas(element, arg || '');
      case 'is':
        return this.matches(element, arg || '');
      case 'contains':
        return this.matchContains(element, arg || '');
      default:
        return true;
    }
  }

  private matchNthChild(element: ElementNode, formula: string): boolean {
    const { a, b } = this.parseNthFormula(formula);
    const position = this.getElementChildIndex(element);
    return this.testNthFormula(position, a, b);
  }

  private matchNthLastChild(element: ElementNode, formula: string): boolean {
    if (!element.parent) return false;
    const { a, b } = this.parseNthFormula(formula);
    const totalElements = this.getElementCount(element.parent);
    const position = totalElements - this.getElementChildIndex(element) + 1;
    return this.testNthFormula(position, a, b);
  }

  private matchNthOfType(element: ElementNode, formula: string): boolean {
    const { a, b } = this.parseNthFormula(formula);
    const position = this.getTypeIndex(element);
    return this.testNthFormula(position, a, b);
  }

  private matchNthLastOfType(element: ElementNode, formula: string): boolean {
    if (!element.parent) return false;
    const { a, b } = this.parseNthFormula(formula);
    const typeSiblings = element.parent.children.filter(
      c => c.nodeType === 1 && (c as ElementNode).tagName === element.tagName
    );
    const typeIndex = typeSiblings.findIndex(s => s === element) + 1;
    const position = typeSiblings.length - typeIndex + 1;
    return this.testNthFormula(position, a, b);
  }

  private getTypeIndex(element: ElementNode): number {
    if (!element.parent) return 1;
    let index = 1;
    for (let i = 0; i < element.childIndex; i++) {
      const sibling = element.parent.children[i];
      if (sibling.nodeType === 1 && (sibling as ElementNode).tagName === element.tagName) {
        index++;
      }
    }
    return index;
  }

  private parseNthFormula(formula: string): { a: number; b: number } {
    formula = formula.trim().toLowerCase();

    if (formula === 'odd') return { a: 2, b: 1 };
    if (formula === 'even') return { a: 2, b: 0 };

    const match = formula.match(/^([+-]?\d*)?n(?:\s*([+-]\s*\d+))?$|^([+-]?\d+)$/);
    if (!match) return { a: 0, b: 0 };

    if (match[3]) {
      return { a: 0, b: parseInt(match[3], 10) };
    }

    let a = 1;
    if (match[1]) {
      if (match[1] === '-') a = -1;
      else if (match[1] === '+') a = 1;
      else a = parseInt(match[1], 10);
    }

    let b = 0;
    if (match[2]) {
      b = parseInt(match[2].replace(/\s+/g, ''), 10);
    }

    return { a, b };
  }

  private testNthFormula(position: number, a: number, b: number): boolean {
    if (a === 0) {
      return position === b;
    }
    const diff = position - b;
    if (a > 0) {
      return diff >= 0 && diff % a === 0;
    } else {
      return diff <= 0 && diff % a === 0;
    }
  }

  private isEmpty(element: ElementNode): boolean {
    for (const child of element.children) {
      if (child.nodeType === 1) return false;
      if (child.nodeType === 3 && (child.textContent || '').trim().length > 0) {
        return false;
      }
    }
    return true;
  }

  private matchHas(element: ElementNode, selector: string): boolean {
    const results = this.querySelectorAll(element, selector);
    return results.length > 0;
  }

  private matchContains(element: ElementNode, text: string): boolean {
    function getText(node: DOMNode): string {
      if (node.nodeType === 3) return node.textContent || '';
      return node.children.map(getText).join('');
    }
    return getText(element).includes(text);
  }

  private matchSelectorAll(root: DOMNode, selector: CSSSelector): ElementNode[] {
    const results: ElementNode[] = [];
    const self = this;

    function traverse(node: DOMNode): void {
      if (node.nodeType === 1) {
        if (self.matchSelector(node as ElementNode, selector)) {
          results.push(node as ElementNode);
        }
      }
      for (const child of node.children) {
        traverse(child);
      }
    }

    for (const child of root.children) {
      traverse(child);
    }

    return results;
  }
}

export function parseSelector(selector: string): CSSSelector {
  const parser = new SelectorParser();
  return parser.parse(selector);
}

export function matches(element: ElementNode, selector: string): boolean {
  const matcher = new SelectorMatcher();
  return matcher.matches(element, selector);
}

export function querySelector(root: DOMNode, selector: string): ElementNode | null {
  const matcher = new SelectorMatcher();
  return matcher.querySelector(root, selector);
}

export function querySelectorAll(root: DOMNode, selector: string): ElementNode[] {
  const matcher = new SelectorMatcher();
  return matcher.querySelectorAll(root, selector);
}
