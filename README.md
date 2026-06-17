# Web Scraper Core - 浏览器自动化与网页抓取框架核心

一个功能完整的网页抓取与浏览器自动化框架核心，包含 HTML 解析、CSS 选择器引擎、动作执行、数据提取和爬虫调度五大核心模块。

## 项目结构

```
src/
├── types/           # TypeScript 类型定义
├── html-parser/    # HTML 解析器 - 将 HTML 解析为 DOM 树
├── css-selector/   # CSS 选择器引擎 - 支持组合器与伪类
├── action-executor/ # 动作执行器 - 模拟用户交互
├── extraction/    # 数据提取 - 声明式规则提取
├── crawler/       # 爬虫调度 - BFS、限速、并发、去重
├── examples/      # 使用示例
└── index.ts      # 主入口
```

## 模块详解

---

## 1. HTML 解析模块 ([html-parser/index.ts](file:///d:/trae-bz/TraeProjects/82/src/html-parser/index.ts))

### HTML 如何解析成 DOM 树

HTML 解析采用**词法分析 + 语法分析**的经典编译器架构：

### 解析流程

```
HTML 字符串 → 词法分析器(Tokenizer) → Token 流 → 语法分析器 → DOM 树
```

#### 1.1 词法分析 (Tokenization)

词法分析器逐字符扫描 HTML 字符串，将其分解为以下类型的 Token：

- `TAG_START` - 开始标签，如 `<div>`
- `TAG_END` - 结束标签，如 `</div>`
- `SELF_CLOSING_TAG` - 自闭合标签，如 `<img />`
- `TEXT` - 文本内容
- `COMMENT` - 注释，如 `<!-- comment -->`
- `DOCTYPE` - 文档类型声明

**关键代码** [HTMLParser.parse](file:///d:/trae-bz/TraeProjects/82/src/html-parser/index.ts#L38-L68):

```typescript
public parse(html: string): DOMNode {
  while (this.pos < this.input.length) {
    if (this.input.startsWith('<!--', this.pos)) {
      this.parseComment();
    } else if (this.input.startsWith('</', this.pos)) {
      this.parseEndTag();
    } else if (this.input.startsWith('<', this.pos)) {
      this.parseStartTag();
    } else {
      this.parseText();
    }
  }
}
```

#### 1.2 语法分析 (Tree Construction)

使用**栈结构**来维护当前的 DOM 树构建上下文：

- 遇到开始标签 → 创建元素节点 → 压入栈 → 添加为当前栈顶元素的子节点
- 遇到结束标签 → 从栈中弹出对应元素
- 遇到文本 → 创建文本节点 → 添加为当前栈顶元素的子节点

**DOM 节点结构**:
```typescript
interface DOMNode {
  nodeType: number;        // 1: 元素, 3: 文本, 8: 注释, 9: 文档
  tagName?: string;     // 元素标签名
  textContent?: string; // 文本内容
  attributes: Record<string, string>; // 属性键值对
  children: DOMNode[];    // 子节点数组
  parent: DOMNode | null;  // 父节点引用
  childIndex: number;      // 在兄弟节点中的索引
}
```

#### 1.3 特殊处理机制

**自闭合标签** ([SELF_CLOSING_TAGS](file:///d:/trae-bz/TraeProjects/82/src/html-parser/index.ts#L21-L24)):
- `<area>, <base>, <br>, <col>, <embed>, <hr>, <img>, <input>, <link>, <meta>, <param>, <source>, <track>, <wbr>`
- 这些标签不会压入栈，因为它们没有子节点

**可选闭合标签** ([OPTIONAL_CLOSING_TAGS](file:///d:/trae-bz/TraeProjects/82/src/html-parser/index.ts#L26-L30)):
- `<html>, <head>, <body>, <li>, <p>, <td>, <th>, <tr> 等
- 当遇到特定标签时自动关闭未闭合的标签

**HTML 实体解码** ([decodeEntities](file:///d:/trae-bz/TraeProjects/82/src/html-parser/index.ts#L352-L381)):
- `&amp;` → `&`, `&lt;` → `<`, `&nbsp;` → 不间断空格
- 支持数字实体 `&#65;` → `A` 和十六进制实体 `&#x41;` → `A`

**Raw text 元素** ([parseText](file:///d:/trae-bz/TraeProjects/82/src/html-parser/index.ts#L256-L297)):
- `<script>`, `<style>`, `<textarea>` 内的内容不解析为标签

---

## 2. CSS 选择器引擎 ([css-selector/index.ts](file:///d:/trae-bz/TraeProjects/82/src/css-selector/index.ts))

### CSS 选择器如何解析并在树上匹配元素

选择器引擎分为**选择器解析器**和**元素匹配器**两部分。

### 2.1 选择器解析

将选择器字符串解析为结构化的选择器对象：

```
"div.container > article.post h2.title:nth-child(2)"
    ↓
{
  parts: [
    { tagName: 'DIV', classNames: ['container'] },
    { combinator: '>', tagName: 'ARTICLE', classNames: ['post'] },
    { combinator: ' ', tagName: 'H2', classNames: ['title'],
      pseudoClasses: [{ name: 'nth-child', argument: '2' }] }
  ],
  specificity: 13
}
```

#### 支持的选择器类型

| 类型 | 示例 | 说明 |
|------|------|------|
| 通用选择器 | `*` | 匹配所有元素 |
| 标签选择器 | `div`, `p` | 按标签名匹配 |
| ID 选择器 | `#main` | 按 id 属性匹配 |
| 类选择器 | `.container` | 按 class 属性匹配 |
| 属性选择器 | `[href]`, `[href="https://"]` | 按属性匹配 |
| 伪类选择器 | `:first-child`, `:nth-child(2n+1)` | 伪类匹配 |

#### 属性选择器运算符

| 运算符 | 示例 | 说明 |
|--------|------|------|
| `=` | `[type="text"]` | 完全匹配 |
| `~=` | `[class~="active"]` | 空格分隔列表包含 |
| `\|=` | `[lang\|="en"]` | 语言前缀匹配 |
| `^=` | `[href^="https://"]` | 前缀匹配 |
| `$=` | `[src$=".jpg"]` | 后缀匹配 |
| `*=` | `[title*="test"]` | 包含匹配 |

#### 组合器 (Combinators)

| 组合器 | 示例 | 说明 |
|--------|------|------|
| 空格 | `div p` | 后代选择器 - 所有后代 |
| `>` | `div > p` | 子选择器 - 直接子元素 |
| `+` | `h1 + p` | 相邻兄弟 - 紧接的下一个兄弟 |
| `~` | `h1 ~ p` | 通用兄弟 - 之后的所有兄弟 |

#### 伪类支持

| 伪类 | 说明 |
|--------|------|
| `:first-child` | 第一个子元素 |
| `:last-child` | 最后一个子元素 |
| `:nth-child(an+b)` | 第 n 个子元素 |
| `:nth-of-type(an+b)` | 同类型第 n 个 |
| `:only-child` | 唯一子元素 |
| `:empty` | 没有子元素 |
| `:not(selector)` | 否定伪类 |
| `:has(selector)` | 包含指定后代 |
| `:is(selector)` | 匹配任一选择器 |
| `:contains(text)` | 包含指定文本 |

**`:nth-child` 公式解析** ([parseNthFormula](file:///d:/trae-bz/TraeProjects/82/src/css-selector/index.ts#L543-L569)):
- `odd` → `2n+1`
- `even` → `2n`
- `3` → `0n+3` (第 3 个)
- `2n+1` → 第 1, 3, 5... 个
- `-n+3` → 前 3 个

### 2.2 选择器匹配算法

采用**从右向左**的匹配策略（与浏览器一致）：

```
匹配 div.container > article.post h2.title
    ↓
1. 先匹配最右边的 h2.title
2. 再检查其父节点是否匹配 article.post (通过 > 组合器)
3. 最后检查 article.post 的父节点是否匹配 div.container
```

**匹配流程** ([matchSelectorParts](file:///d:/trae-bz/TraeProjects/82/src/css-selector/index.ts#L264-L283):

```typescript
private matchSelectorParts(element, parts, partIndex): boolean {
  if (partIndex < 0) return true;

  // 1. 匹配当前部分
  if (!this.matchSimpleSelector(element, parts[partIndex])) return false;

  // 2. 如果是第一部分，匹配完成
  if (partIndex === 0) return true;

  // 3. 根据组合器向上匹配前一部分
  const combinator = parts[partIndex].combinator;
  return this.matchCombinator(element, parts[partIndex - 1], parts, partIndex - 1, combinator);
}
```

**组合器匹配实现**:

- **后代选择器** (` `): 遍历所有祖先节点 ([matchDescendant](file:///d:/trae-bz/TraeProjects/82/src/css-selector/index.ts#L306-L324))
- **子选择器** (`>`): 检查直接父节点 ([matchChild](file:///d:/trae-bz/TraeProjects/82/src/css-selector/index.ts#L326-L340))
- **相邻兄弟** (`+`): 检查前一个兄弟节点 ([matchAdjacentSibling](file:///d:/trae-bz/TraeProjects/82/src/css-selector/index.ts#L342-L356))
- **通用兄弟** (`~`): 检查所有前面的兄弟节点 ([matchGeneralSibling](file:///d:/trae-bz/TraeProjects/82/src/css-selector/index.ts#L358-L376))

### 2.3 特异性计算 ([calculateSpecificity](file:///d:/trae-bz/TraeProjects/82/src/css-selector/index.ts#L207-L229))

CSS 特异性（Specificity）计算公式：
- `a` = ID 选择器数量 × 10000
- `b` = 类选择器、属性选择器、伪类数量 × 100
- `c` = 标签选择器、伪元素数量 × 1

例如：
  - `#main` → a=1, b=0, c=0 → 10000
  - `div.container` → a=0, b=1, c=1 → 101
  - `ul li.active a` → a=0, b=1, c=3 → 103

---

## 3. 数据提取模块 ([extraction/index.ts](file:///d:/trae-bz/TraeProjects/82/src/extraction/index.ts))

### 提取规则如何声明式地从匹配元素抽取数据

采用**声明式规则** + **模式匹配**的方式，用户只需定义"要什么"，而不是"怎么取"。

### 3.1 提取规则结构

```typescript
interface ExtractionRule {
  name: string;           // 字段名
  selector: string;         // CSS 选择器
  extract: 'text' | 'html' | 'attr' | 'prop' | 'data';
  attrName?: string;     // 属性名（attr/prop 使用）
  dataKey?: string;      // data-* 属性键名
  multiple?: boolean;    // 是否提取多个值
  defaultValue?: unknown; // 默认值
  transform?: (value) => unknown; // 数据转换函数
  nested?: Record<string, ExtractionRule>; // 嵌套提取规则
}
```

### 3.2 提取类型

| 提取类型 | 说明 | 示例 |
|----------|------|------|
| `text` | 提取元素文本内容 | `textContent.trim()` |
| `html` | 提取元素 innerHTML | `innerHTML` |
| `attr` | 提取指定属性 | `element.attributes[attrName]` |
| `prop` | 提取 DOM 属性 | 智能获取 value, checked, href 等 |
| `data` | 提取 data-* 属性 | `element.attributes['data-' + dataKey]` |

### 3.3 提取流程

1. **选择器匹配** - 使用 CSS 选择器找到目标元素
2. **值提取** - 根据提取类型获取值
3. **默认值处理** - 无匹配时返回默认值
4. **数据转换** - 应用 transform 函数
5. **嵌套提取** - 如果有 nested 规则，递归提取

**核心提取逻辑** ([extractSingle](file:///d:/trae-bz/TraeProjects/82/src/extraction/index.ts#L70-L119)):

```typescript
private extractSingle(context, element, rule): unknown {
  // 1. 根据提取类型获取值
  switch (rule.extract) {
    case 'text': value = textContent(element).trim(); break;
    case 'html': value = innerHTML(element); break;
    case 'attr': value = element.attributes[rule.attrName]; break;
    case 'prop': value = this.getProperty(element, rule.attrName); break;
    case 'data': value = this.getDataAttribute(element, rule.dataKey); break;
  }

  // 2. 默认值处理
  if (value === undefined || value === null || value === '') {
    value = rule.defaultValue;
  }

  // 3. 数据转换
  if (rule.transform && value !== undefined) {
    value = rule.transform(value);
  }

  // 4. 嵌套提取
  if (rule.nested) {
    const nestedResult = this.extractSchema({ ...context, dom: element }, rule.nested);
    value = { ...(value as object), ...nestedResult };
  }

  return value;
}
```

### 3.4 声明式提取示例

```typescript
const schema = createSchema({
  products: listRule('products', '.product', {
    id: attrRule('id', '.product', 'data-id', {
      transform: (v) => parseInt(v as string, 10),
    }),
    name: textRule('name', '.product-name'),
    price: textRule('price', '.price', {
      transform: (v) => parseInt((v as string).replace(/[^\d]/g, ''), 10),
    }),
    rating: textRule('rating', '.rating .stars', {
      transform: (v) => parseFloat(v as string),
    }),
  }),
});
```

---

## 4. 动作执行模块 ([action-executor/index.ts](file:///d:/trae-bz/TraeProjects/82/src/action-executor/index.ts))

### 模拟交互的动作序列

支持声明式的动作序列，用于模拟用户与页面的交互。

### 4.1 支持的动作类型

| 动作类型 | 说明 |
|----------|------|
| `click` | 点击元素 |
| `type` | 在输入框输入文本 |
| `select` | 选择下拉框选项 |
| `scroll` | 滚动到指定位置 |
| `hover` | 鼠标悬停 |
| `focus` | 元素获得焦点 |
| `blur` | 元素失去焦点 |
| `submit` | 提交表单 |
| `wait` | 等待指定时间或等待元素出现 |
| `evaluate` | 执行自定义 JavaScript |

### 4.2 动作执行流程

```
动作序列 → 按顺序执行 → 每个动作:
  ├─ 查找元素（通过选择器）
  ├─ 执行动作（点击/输入/等）
  ├─ 重试机制（失败自动重试）
  └─ 延迟等待（action.delay）
  └─ 错误处理（continueOnError 选项）
```

**重试机制** ([executeWithRetry](file:///d:/trae-bz/TraeProjects/82/src/action-executor/index.ts#L88-L118)):
- 默认重试 2 次
- 指数退避延迟
- 可配置重试次数和延迟

### 4.3 动作创建辅助函数

```typescript
// 创建登录表单的动作序列
const actions = createActionSequence([
  typeText('#username', 'testuser', { delay: 100 }),
  typeText('#password', 'password123', { delay: 100 }),
  waitFor('#submit-btn', { delay: 500 }),
  click('#submit-btn'),
]);
```

---

## 5. 抓取调度模块 ([crawler/index.ts](file:///d:/trae-bz/TraeProjects/82/src/crawler/index.ts))

### 5.1 抓取任务如何调度

爬虫调度采用**生产者-消费者**模式，结合**广度优先搜索(BFS)** 遍历策略。

#### 架构图

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  URL 去重器 │──▶│  任务队列   │──▶│  工作线程 1  │
└─────────────┘   └─────────────┘   └─────────────┘
                      │  (FIFO/BFS)   │   ┌─────────────┐
                      │                 │──▶│  工作线程 2  │
                      │  优先级队列   │   └─────────────┘
                      │                 │   ┌─────────────┐
                      └─────────────┘   └──▶│  工作线程 N  │
                                                    │
                                                    ▼
                                              ┌─────────────┐
                                              │  结果回调   │
                                              └─────────────┘
```

### 5.2 广度优先搜索 (BFS)

**工作原理**:
- 种子 URL (深度 0) → 加入队列
- 处理深度 0 的所有 URL → 提取链接 → 深度 1 的 URL 入队
- 处理深度 1 的所有 URL → 提取链接 → 深度 2 的 URL 入队
- 直到达到最大深度 maxDepth

**BFS 的优势**:
- 确保先抓取重要的浅层页面
- 避免深度陷阱
- 易于并行处理

### 5.3 并发控制 ([processQueue](file:///d:/trae-bz/TraeProjects/82/src/crawler/index.ts#L153-L162)):

```typescript
private async processQueue(options): Promise<void> {
  const maxConcurrency = this.options.maxConcurrency;
  const workers: Promise<void>[] = [];

  // 创建并发工作线程
  for (let i = 0; i < maxConcurrency; i++) {
    workers.push(this.worker(options));
  }

  await Promise.all(workers);
}
```

**工作线程循环** ([worker](file:///d:/trae-bz/TraeProjects/82/src/crawler/index.ts#L164-L195)):
```typescript
private async worker(options): Promise<void> {
  while (this.isRunning) {
    const task = this.queue.dequeue();
    if (!task) {
      if (this.activeTasks.size === 0) break;
      await this.delay(100);
      continue;
    }
    // 处理任务...
  }
}
```

### 5.4 限速机制

使用**令牌桶算法** ([RateLimiter](file:///d:/trae-bz/TraeProjects/82/src/crawler/fetcher.ts#L151-L173)):

```typescript
class RateLimiter {
  private minInterval: number; // 最小请求间隔 (ms)
  private lastRequestTime: number = 0;

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / Math.max(1, requestsPerSecond);
  }

  public async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }

    this.lastRequestTime = Date.now();
  }
}
```

### 5.5 URL 去重 ([URLDeduplicator](file:///d:/trae-bz/TraeProjects/82/src/crawler/url-deduplicator.ts))

#### 去重流程

```
URL → 规范化 → 哈希指纹 → 双重检查 → 标记为已访问
```

#### URL 规范化 ([normalizeURL](file:///d:/trae-bz/TraeProjects/82/src/crawler/url-utils.ts#L24-L60)):
1. 移除 URL 片段 (`#section`)
2. 规范化协议 (HTTP → http)
3. 小写主机名
4. 排序查询参数 (?b=2&a=1 → ?a=1&b=2)
5. 移除尾部斜杠

#### 双重去重机制:
1. `Set<string>` 存储规范化 URL
2. `Set<string>` 存储 URL 哈希指纹
3. `Map<string, URLRecord>` 存储详细记录

**去重检查** ([isSeen](file:///d:/trae-bz/TraeProjects/82/src/crawler/url-deduplicator.ts#L30-L46)):
```typescript
public isSeen(url, normalizedURL?, fingerprint?): boolean {
  // 检查规范化 URL
  if (this.seenURLs.has(normalizedURL)) return true;

  // 检查指纹（防止参数顺序不同但内容相同的 URL
  if (this.seenFingerprints.has(fingerprint)) return true;

  return false;
}
```

### 5.6 相对链接解析成绝对 URL

使用 WHATWG URL API 解析相对 URL：

```typescript
export function resolveRelativeURL(relativeUrl: string, baseURL: string): string {
  try {
    return new URL(relativeUrl, baseURL).href;
  } catch {
    return relativeUrl;
  }
}
```

**相对 URL 类型处理**:
- 绝对路径: `/page2` → `https://example.com/page2`
- 相对路径: `page3.html` → `https://example.com/current/page3.html`
- 上级路径: `../item` → `https://example.com/parent/item`
- 协议相对: `//cdn.com/img.jpg` → `https://cdn.com/img.jpg`
- 绝对 URL: `https://other.com/page` → 不变

### 5.7 抓取深度限制

深度计算逻辑:
- 种子 URL: depth = 0
- 从 depth = n 页面提取的链接: depth = n + 1
- 当 depth > maxDepth 时，不再加入队列

**深度检查** ([addTask](file:///d:/trae-bz/TraeProjects/82/src/crawler/index.ts#L105-L151)):
```typescript
public addTask(url, depth, parentUrl?): boolean {
  // 深度检查
  if (depth > this.options.maxDepth) {
    return false;
  }
  // ... 去重检查、协议检查、域名过滤...
}
```

### 5.8 错误处理与重试

#### 可重试的 HTTP 状态码:
- `408` - 请求超时
- `429` - 请求过多
- `500` - 服务器内部错误
- `502` - 错误网关
- `503` - 服务不可用
- `504` - 网关超时

#### 指数退避算法** ([calculateRetryDelay](file:///d:/trae-bz/TraeProjects/82/src/crawler/fetcher.ts#L130-L132)):
```
delay = baseDelay × 2^attempt

例如 baseDelay = 1000ms:
- 第 1 次重试: 1000 × 2^0 = 1000ms
- 第 2 次重试: 1000 × 2^1 = 2000ms
- 第 3 次重试: 1000 × 2^2 = 4000ms
```

**重试流程** ([Fetcher.fetch](file:///d:/trae-bz/TraeProjects/82/src/crawler/fetcher.ts#L36-L74)):
```typescript
public async fetch(task): Promise<FetchResult> {
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      const result = await this.doFetch(task.url, options);
      if (result.success) return result;

      if (this.shouldRetry(result.status, attempt, options.retries)) {
        throw new Error(`HTTP ${result.status}`);
      }
    } catch (error) {
      if (attempt < options.retries) {
        const delay = this.calculateRetryDelay(attempt, options.retryDelay);
        await this.delay(delay);
      }
    }
  }
}
```

#### 超时处理** ([doFetch](file:///d:/trae-bz/TraeProjects/82/src/crawler/fetcher.ts#L76-L121)):
- 使用 `AbortController` 实现请求超时
- 默认超时 30 秒
- 可配置超时时间

### 5.9 事件系统

爬虫提供完整的事件回调:

| 事件 | 触发时机 |
|------|----------|
| `task-added` | 任务加入队列时 |
| `task-started` | 任务开始处理时 |
| `task-completed` | 任务成功完成时 |
| `task-failed` | 任务失败时 |

使用示例:
```typescript
crawler.on('task-completed', (task, result) => {
  console.log(`完成: ${task.url} - ${result.status}`);
});

crawler.on('task-failed', (task, error) => {
  console.error(`失败: ${task.url} - ${error.message}`);
});
```

## API 参考

### HTML 解析
- `parseHTML(html: string): DOMNode` - 解析 HTML 为 DOM 树
- `outerHTML(node: DOMNode): string` - 获取元素 outerHTML
- `innerHTML(node: DOMNode): string` - 获取元素 innerHTML
- `textContent(node: DOMNode): string` - 获取元素文本内容
- `querySelector(root: DOMNode, selector: string): ElementNode | null`
- `querySelectorAll(root: DOMNode, selector: string): ElementNode[]`

### CSS 选择器
- `parseSelector(selector: string): CSSSelector` - 解析选择器
- `matches(element: ElementNode, selector: string): boolean` - 检查元素是否匹配选择器

### 数据提取
- `textRule(name, selector, options)` - 创建文本提取规则
- `attrRule(name, selector, attrName, options)` - 创建属性提取规则
- `linkRule(name, selector, options)` - 创建链接提取规则
- `imageRule(name, selector, options)` - 创建图片提取规则
- `listRule(name, selector, nested, options)` - 创建列表提取规则
- `createSchema(rules)` - 创建提取规则 schema

### 动作执行
- `click(selector, options)` - 创建点击动作
- `typeText(selector, value, options)` - 创建输入动作
- `waitFor(selectorOrMs, options)` - 创建等待动作
- `createActionSequence(actions)` - 创建动作序列

### 爬虫调度
- `createCrawler(options)` - 创建爬虫实例
- `crawler.crawl(seedUrls, options)` - 开始抓取
- `crawler.getStats()` - 获取统计信息
- `crawler.pause() / resume() / stop()` - 控制爬虫

## 快速开始

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 运行示例
npm run build && npm start
```

## 使用示例

```typescript
import {
  parseHTML,
  querySelectorAll,
  createCrawler,
  textRule,
  createSchema,
  createActionSequence,
  click,
  typeText,
} from 'web-scraper-core';

// 1. HTML 解析与选择器查询
const dom = parseHTML(html);
const titles = querySelectorAll(dom, 'h2.title');

// 2. 声明式数据提取
const schema = createSchema({
  title: textRule('title', 'h1'),
  articles: listRule('articles', '.article', {
    title: textRule('title', 'h2'),
    link: { name: 'url', selector: 'a', extract: 'attr', attrName: 'href' },
  }),
});

// 3. 动作序列
const actions = createActionSequence([
  typeText('#search', 'web scraping'),
  click('#submit'),
]);

// 4. 爬虫调度
const crawler = createCrawler({
  maxConcurrency: 5,
  maxDepth: 3,
  rateLimit: 1000,
});

crawler.on('task-completed', (task, result) => {
  console.log(`抓取成功: ${task.url}`);
});

const results = await crawler.crawl('https://example.com', {
  extract: schema,
  actions,
  followLinks: true,
});
```

## 技术栈

- **TypeScript** - 类型安全
- **零外部依赖** - 纯 TypeScript 实现
- **WHATWG URL API** - URL 解析
- **fetch API** - 网络请求

## 许可证

MIT License
