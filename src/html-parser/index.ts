import type { DOMNode, ElementNode, TextNode, CommentNode } from '../types';

enum TokenType {
  TAG_START = 'TAG_START',
  TAG_END = 'TAG_END',
  SELF_CLOSING_TAG = 'SELF_CLOSING_TAG',
  TEXT = 'TEXT',
  COMMENT = 'COMMENT',
  DOCTYPE = 'DOCTYPE',
  EOF = 'EOF',
}

interface Token {
  type: TokenType;
  tagName?: string;
  attributes?: Record<string, string>;
  content?: string;
  selfClosing?: boolean;
}

const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const OPTIONAL_CLOSING_TAGS = new Set([
  'html', 'head', 'body', 'li', 'dt', 'dd', 'p', 'rt', 'rp',
  'optgroup', 'option', 'colgroup', 'thead', 'tbody', 'tfoot',
  'tr', 'td', 'th',
]);

export class HTMLParser {
  private pos: number = 0;
  private input: string = '';
  private stack: DOMNode[] = [];
  private document: DOMNode | null = null;

  public parse(html: string): DOMNode {
    this.pos = 0;
    this.input = html;
    this.stack = [];
    this.document = this.createDocumentNode();
    this.stack.push(this.document);

    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.pos >= this.input.length) break;

      if (this.input.startsWith('<!--', this.pos)) {
        this.parseComment();
      } else if (this.input.startsWith('<!DOCTYPE', this.pos) || this.input.startsWith('<!doctype', this.pos)) {
        this.parseDoctype();
      } else if (this.input.startsWith('</', this.pos)) {
        this.parseEndTag();
      } else if (this.input.startsWith('<', this.pos)) {
        this.parseStartTag();
      } else {
        this.parseText();
      }
    }

    while (this.stack.length > 1) {
      this.stack.pop();
    }

    return this.document;
  }

  private createDocumentNode(): DOMNode {
    return {
      nodeType: 9,
      attributes: {},
      children: [],
      parent: null,
      childIndex: 0,
    };
  }

  private createElementNode(tagName: string, attributes: Record<string, string>): ElementNode {
    return {
      nodeType: 1,
      tagName: tagName.toUpperCase(),
      attributes,
      children: [],
      parent: null,
      childIndex: 0,
    };
  }

  private createTextNode(content: string): TextNode {
    return {
      nodeType: 3,
      textContent: content,
      attributes: {},
      children: [],
      parent: null,
      childIndex: 0,
    };
  }

  private createCommentNode(content: string): CommentNode {
    return {
      nodeType: 8,
      textContent: content,
      attributes: {},
      children: [],
      parent: null,
      childIndex: 0,
    };
  }

  private appendNode(node: DOMNode): void {
    const parent = this.stack[this.stack.length - 1];
    node.parent = parent;
    node.childIndex = parent.children.length;
    parent.children.push(node);
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private parseStartTag(): void {
    this.pos++;

    const token = this.readTag();

    if (!token.tagName) {
      return;
    }

    const tagNameLower = token.tagName.toLowerCase();

    this.handleOptionalClosingTags(tagNameLower);

    const element = this.createElementNode(token.tagName, token.attributes || {});
    this.appendNode(element);

    if (!token.selfClosing && !SELF_CLOSING_TAGS.has(tagNameLower)) {
      this.stack.push(element);
    }
  }

  private parseEndTag(): void {
    this.pos += 2;

    const endPos = this.input.indexOf('>', this.pos);
    if (endPos === -1) {
      this.pos = this.input.length;
      return;
    }

    const tagName = this.input.slice(this.pos, endPos).trim().toUpperCase();
    this.pos = endPos + 1;

    let foundIndex = -1;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const node = this.stack[i];
      if (node.nodeType === 1 && node.tagName === tagName) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== -1) {
      while (this.stack.length > foundIndex) {
        this.stack.pop();
      }
    }
  }

  private readTag(): Token {
    const tagNameMatch = this.input.slice(this.pos).match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    if (!tagNameMatch) {
      this.pos = this.input.indexOf('>', this.pos) + 1;
      return { type: TokenType.TAG_START };
    }

    const tagName = tagNameMatch[1];
    this.pos += tagName.length;

    const attributes = this.readAttributes();

    let selfClosing = false;
    this.skipWhitespace();

    if (this.input.startsWith('/>', this.pos)) {
      selfClosing = true;
      this.pos += 2;
    } else if (this.input[this.pos] === '>') {
      this.pos++;
    }

    return {
      type: selfClosing ? TokenType.SELF_CLOSING_TAG : TokenType.TAG_START,
      tagName,
      attributes,
      selfClosing,
    };
  }

  private readAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {};

    while (this.pos < this.input.length) {
      this.skipWhitespace();

      if (this.input[this.pos] === '>' || this.input.startsWith('/>', this.pos)) {
        break;
      }

      const attrNameMatch = this.input.slice(this.pos).match(/^([a-zA-Z_][a-zA-Z0-9_-]*)/);
      if (!attrNameMatch) {
        this.pos++;
        continue;
      }

      const attrName = attrNameMatch[1].toLowerCase();
      this.pos += attrName.length;

      this.skipWhitespace();

      let attrValue = '';
      if (this.input[this.pos] === '=') {
        this.pos++;
        this.skipWhitespace();

        const quoteChar = this.input[this.pos];
        if (quoteChar === '"' || quoteChar === "'") {
          this.pos++;
          const valueEnd = this.input.indexOf(quoteChar, this.pos);
          if (valueEnd !== -1) {
            attrValue = this.input.slice(this.pos, valueEnd);
            this.pos = valueEnd + 1;
          }
        } else {
          const valueMatch = this.input.slice(this.pos).match(/^([^ \t\n\r"'>]+)/);
          if (valueMatch) {
            attrValue = valueMatch[1];
            this.pos += attrValue.length;
          }
        }
      } else {
        attrValue = '';
      }

      attributes[attrName] = this.decodeEntities(attrValue);
    }

    return attributes;
  }

  private parseText(): void {
    const parent = this.stack[this.stack.length - 1];
    const parentTag = parent.nodeType === 1 ? parent.tagName?.toLowerCase() : null;

    let endMarker: string | null = null;
    if (parentTag === 'script') {
      endMarker = '</script';
    } else if (parentTag === 'style') {
      endMarker = '</style';
    } else if (parentTag === 'textarea') {
      endMarker = '</textarea';
    } else if (parentTag === 'pre') {
      endMarker = '<';
    }

    let textEnd: number;
    if (endMarker) {
      textEnd = this.input.indexOf(endMarker, this.pos);
      if (textEnd === -1) textEnd = this.input.length;
    } else {
      const ltPos = this.input.indexOf('<', this.pos);
      textEnd = ltPos !== -1 ? ltPos : this.input.length;
    }

    const textContent = this.input.slice(this.pos, textEnd);
    this.pos = textEnd;

    const decodedText = this.decodeEntities(textContent);

    if (parentTag !== 'script' && parentTag !== 'style') {
      const lastChild = parent.children[parent.children.length - 1];
      if (lastChild && lastChild.nodeType === 3 && lastChild.textContent) {
        lastChild.textContent += decodedText;
        return;
      }
    }

    if (decodedText.trim().length > 0 || parentTag === 'pre' || parentTag === 'textarea') {
      const textNode = this.createTextNode(decodedText);
      this.appendNode(textNode);
    }
  }

  private parseComment(): void {
    const endPos = this.input.indexOf('-->', this.pos + 4);
    if (endPos === -1) {
      this.pos = this.input.length;
      return;
    }

    const content = this.input.slice(this.pos + 4, endPos);
    this.pos = endPos + 3;

    const commentNode = this.createCommentNode(content);
    this.appendNode(commentNode);
  }

  private parseDoctype(): void {
    const endPos = this.input.indexOf('>', this.pos);
    if (endPos === -1) {
      this.pos = this.input.length;
      return;
    }
    this.pos = endPos + 1;
  }

  private handleOptionalClosingTags(currentTag: string): void {
    const implicitCloseRules: Record<string, string[]> = {
      p: ['address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul'],
      li: ['li'],
      dt: ['dt', 'dd'],
      dd: ['dt', 'dd'],
      tr: ['tr'],
      td: ['td', 'th', 'tr'],
      th: ['td', 'th', 'tr'],
      thead: ['tbody', 'tfoot'],
      tbody: ['tbody', 'tfoot'],
      tfoot: ['tbody'],
      head: ['body'],
    };

    while (this.stack.length > 1) {
      const top = this.stack[this.stack.length - 1];
      if (top.nodeType !== 1 || !top.tagName) break;

      const topTag = top.tagName.toLowerCase();
      const rules = implicitCloseRules[topTag];

      if (rules && rules.includes(currentTag)) {
        this.stack.pop();
      } else {
        break;
      }
    }
  }

  private decodeEntities(text: string): string {
    const entityMap: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&nbsp;': '\u00A0',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
      '&euro;': '€',
      '&pound;': '£',
      '&yen;': '¥',
      '&cent;': '¢',
    };

    return text.replace(/&([a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/g, (match, entity) => {
      if (entityMap[match]) {
        return entityMap[match];
      }
      if (entity.startsWith('#x')) {
        return String.fromCharCode(parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith('#')) {
        return String.fromCharCode(parseInt(entity.slice(1), 10));
      }
      return match;
    });
  }
}

export function parseHTML(html: string): DOMNode {
  const parser = new HTMLParser();
  return parser.parse(html);
}

export function outerHTML(node: DOMNode): string {
  if (node.nodeType === 3) {
    return node.textContent || '';
  }
  if (node.nodeType === 8) {
    return `<!--${node.textContent}-->`;
  }
  if (node.nodeType === 1 && node.tagName) {
    const attrs = Object.entries(node.attributes)
      .map(([k, v]) => v ? `${k}="${v}"` : k)
      .join(' ');

    const tag = node.tagName.toLowerCase();
    const attrsStr = attrs ? ` ${attrs}` : '';

    if (SELF_CLOSING_TAGS.has(tag)) {
      return `<${tag}${attrsStr}>`;
    }

    const childrenHTML = node.children.map(outerHTML).join('');
    return `<${tag}${attrsStr}>${childrenHTML}</${tag}>`;
  }
  return node.children.map(outerHTML).join('');
}

export function innerHTML(node: DOMNode): string {
  return node.children.map(outerHTML).join('');
}

export function textContent(node: DOMNode): string {
  if (node.nodeType === 3) {
    return node.textContent || '';
  }
  return node.children.map(textContent).join('');
}

export function getElementsByTagName(root: DOMNode, tagName: string): ElementNode[] {
  const results: ElementNode[] = [];
  const upperTagName = tagName.toUpperCase();

  function traverse(node: DOMNode): void {
    if (node.nodeType === 1 && node.tagName === upperTagName) {
      results.push(node as ElementNode);
    }
    node.children.forEach(traverse);
  }

  root.children.forEach(traverse);
  return results;
}

export function getElementById(root: DOMNode, id: string): ElementNode | null {
  function traverse(node: DOMNode): ElementNode | null {
    if (node.nodeType === 1 && node.attributes.id === id) {
      return node as ElementNode;
    }
    for (const child of node.children) {
      const found = traverse(child);
      if (found) return found;
    }
    return null;
  }

  return traverse(root);
}

export function getElementsByClassName(root: DOMNode, className: string): ElementNode[] {
  const results: ElementNode[] = [];
  const classes = className.split(/\s+/).filter(Boolean);

  function traverse(node: DOMNode): void {
    if (node.nodeType === 1) {
      const nodeClasses = (node.attributes.class || '').split(/\s+/).filter(Boolean);
      if (classes.every(c => nodeClasses.includes(c))) {
        results.push(node as ElementNode);
      }
    }
    node.children.forEach(traverse);
  }

  root.children.forEach(traverse);
  return results;
}
