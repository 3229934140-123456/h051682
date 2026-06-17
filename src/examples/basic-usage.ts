import {
  parseHTML,
  querySelector,
  querySelectorAll,
  textContent,
  outerHTML,
  parseSelector,
  matches,
  createCrawler,
  createActionSequence,
  click,
  typeText,
  waitFor,
  textRule,
  linkRule,
  imageRule,
  attrRule,
  listRule,
  createSchema,
  resolveRelativeURL,
  normalizeURL,
} from '..';

async function exampleHTMLParser() {
  console.log('=== HTML 解析示例 ===');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>测试页面</title>
    </head>
    <body>
      <div id="main" class="container">
        <h1 data-id="1">Hello World</h1>
        <p class="intro">这是一个测试段落</p>
        <ul class="list">
          <li class="item">第一项</li>
          <li class="item active">第二项</li>
          <li class="item">第三项</li>
        </ul>
        <a href="/page1">链接1</a>
        <a href="https://example.com/page2">链接2</a>
        <img src="/images/test.jpg" alt="测试图片">
      </div>
    </body>
    </html>
  `;

  const dom = parseHTML(html);

  const title = querySelector(dom, 'title');
  console.log('页面标题:', title ? textContent(title) : '未找到');

  const h1 = querySelector(dom, 'h1');
  console.log('H1 文本:', h1 ? textContent(h1) : '未找到');
  console.log('H1 data-id:', h1?.attributes['data-id']);

  const items = querySelectorAll(dom, 'li.item');
  console.log('列表项数量:', items.length);
  items.forEach((item, i) => {
    console.log(`  项 ${i + 1}:`, textContent(item));
  });

  const activeItem = querySelector(dom, 'li.active');
  console.log('激活项:', activeItem ? textContent(activeItem) : '未找到');

  const links = querySelectorAll(dom, 'a[href]');
  console.log('链接:');
  links.forEach((link) => {
    console.log(`  ${textContent(link)} -> ${link.attributes.href}`);
  });

  console.log();
}

async function exampleCSSSelector() {
  console.log('=== CSS 选择器示例 ===');

  const html = `
    <div class="container">
      <article id="post-1" class="post featured">
        <header>
          <h2 class="title">文章标题</h2>
          <span class="date">2024-01-15</span>
        </header>
        <div class="content">
          <p>第一段内容</p>
          <p>第二段内容</p>
        </div>
        <footer>
          <a href="/author" class="author">作者名</a>
          <span class="comments">10 评论</span>
        </footer>
      </article>
      <article class="post">
        <header>
          <h2 class="title">另一篇文章</h2>
        </header>
      </article>
    </div>
  `;

  const dom = parseHTML(html);

  console.log('ID 选择器 #post-1:', !!querySelector(dom, '#post-1'));

  console.log('类选择器 .featured:', !!querySelector(dom, '.featured'));

  console.log('属性选择器 [id^="post"]:', querySelectorAll(dom, '[id^="post"]').length);

  console.log('后代选择器 .container .title:', querySelectorAll(dom, '.container .title').length);

  console.log('子选择器 .content > p:', querySelectorAll(dom, '.content > p').length);

  console.log('相邻兄弟选择器 h2 + span:', !!querySelector(dom, 'h2 + span'));

  console.log('通用兄弟选择器 p ~ p:', !!querySelector(dom, 'p ~ p'));

  console.log(':first-child 伪类:', querySelectorAll(dom, 'p:first-child').length);

  console.log(':last-child 伪类:', querySelectorAll(dom, 'p:last-child').length);

  console.log(':nth-child(2) 伪类:', querySelector(dom, 'li:nth-child(2)') ? '存在' : '不存在');

  console.log(':has() 伪类 article:has(.featured):', querySelectorAll(dom, 'article:has(.title)').length);

  console.log(':not() 伪类 .post:not(.featured):', querySelectorAll(dom, '.post:not(.featured)').length);

  const selector = parseSelector('div.container > article.post.featured h2.title');
  console.log('选择器解析 - 特异性:', selector.specificity);
  console.log('选择器解析 - 部分数:', selector.parts.length);

  console.log();
}

async function exampleExtraction() {
  console.log('=== 数据提取示例 ===');

  const html = `
    <div class="product-list">
      <div class="product" data-id="1001">
        <h3 class="product-name">iPhone 15 Pro</h3>
        <p class="price">¥7,999</p>
        <img src="/images/iphone15.jpg" alt="iPhone 15 Pro">
        <div class="rating">
          <span class="stars">4.5</span>
          <span class="count">128 评价</span>
        </div>
        <a href="/products/1001" class="buy-link">立即购买</a>
      </div>
      <div class="product" data-id="1002">
        <h3 class="product-name">MacBook Pro 14"</h3>
        <p class="price">¥14,999</p>
        <img src="/images/macbook.jpg" alt="MacBook Pro">
        <div class="rating">
          <span class="stars">4.8</span>
          <span class="count">256 评价</span>
        </div>
        <a href="/products/1002" class="buy-link">立即购买</a>
      </div>
    </div>
  `;

  const dom = parseHTML(html);

  const schema = createSchema({
    products: listRule('products', '.product', {
      id: attrRule('id', '.product', 'data-id', {
        transform: (v) => parseInt(v as string, 10),
      }),
      name: textRule('name', '.product-name'),
      price: textRule('price', '.price', {
        transform: (v) => parseInt((v as string).replace(/[^\d]/g, ''), 10),
      }),
      image: imageRule('image', 'img'),
      rating: textRule('rating', '.rating .stars', {
        transform: (v) => parseFloat(v as string),
      }),
      reviewCount: textRule('reviewCount', '.rating .count', {
        transform: (v) => parseInt((v as string).replace(/[^\d]/g, ''), 10),
      }),
      buyLink: linkRule('buyLink', '.buy-link'),
    }),
    totalCount: {
      count: {
        name: 'productCount',
        selector: '.product',
        extract: 'text' as const,
        multiple: true,
        transform: (v) => (v as unknown[]).length,
      },
    },
  });

  const { DataExtractor } = require('../extraction');
  const extractor = new DataExtractor();
  const result = extractor.extract(
    { dom, baseUrl: 'https://example.com', variables: {} },
    schema
  );

  console.log('提取结果:');
  console.log(JSON.stringify(result, null, 2));

  console.log();
}

async function exampleActionExecutor() {
  console.log('=== 动作执行示例 ===');

  const html = `
    <form id="login-form">
      <input type="text" id="username" name="username" placeholder="用户名">
      <input type="password" id="password" name="password" placeholder="密码">
      <button type="submit" id="submit-btn">登录</button>
    </form>
    <div id="greeting"></div>
  `;

  const dom = parseHTML(html);

  const actions = createActionSequence([
    typeText('#username', 'testuser', { delay: 100 }),
    typeText('#password', 'password123', { delay: 100 }),
    waitFor('#submit-btn', { delay: 50 }),
    click('#submit-btn', { delay: 100 }),
  ]);

  console.log('动作序列:');
  actions.forEach((action, i) => {
    console.log(`  ${i + 1}. ${action.type} - ${action.selector || action.value}`);
  });

  const { ActionExecutor } = require('../action-executor');
  const executor = new ActionExecutor();

  const context = {
    dom,
    variables: {},
    results: {},
    currentUrl: 'https://example.com/login',
    delay: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  };

  const results = await executor.execute(actions, context);
  console.log('执行结果:');
  results.forEach((r: any, i: number) => {
    console.log(`  ${i + 1}. ${r.action.type}: ${r.success ? '成功' : `失败 - ${r.error}`}`);
  });

  const usernameInput = querySelector(dom, '#username');
  console.log('用户名输入框值:', usernameInput?.attributes.value);

  console.log();
}

async function exampleURLUtils() {
  console.log('=== URL 工具示例 ===');

  const baseURL = 'https://example.com/products/page1?id=123&sort=price#section';

  const relativeUrls = [
    '/products/page2',
    'page3.html',
    '../category/item',
    '//cdn.example.com/image.jpg',
    'https://other.com/page',
    '#fragment',
    '?query=new',
  ];

  console.log('基础 URL:', baseURL);
  console.log();

  relativeUrls.forEach((relative) => {
    const absolute = resolveRelativeURL(relative, baseURL);
    const normalized = normalizeURL(absolute);
    console.log(`相对: ${relative}`);
    console.log(`  绝对: ${absolute}`);
    console.log(`  规范化: ${normalized}`);
    console.log();
  });

  console.log('URL 规范化选项:');
  const url = 'HTTPS://Example.COM:443/path//to/../page/?b=2&a=1#hash';
  console.log('原始:', url);
  console.log('规范化:', normalizeURL(url));

  console.log();
}

async function exampleCrawlerArchitecture() {
  console.log('=== 爬虫架构示例 ===');
  console.log();
  console.log('爬虫调度器架构:');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│                    Web Crawler                          │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log('│  ┌──────────┐     ┌──────────┐     ┌──────────┐        │');
  console.log('│  │ URL 去重 │────▶│ 任务队列 │────▶│ 工作线程 │        │');
  console.log('│  └──────────┘     └──────────┘     └──────────┘        │');
  console.log('│        │                │                │             │');
  console.log('│        ▼                ▼                ▼             │');
  console.log('│  ┌──────────┐     ┌──────────┐     ┌──────────┐        │');
  console.log('│  │  网络请求 │     │ HTML解析 │     │ 数据提取 │        │');
  console.log('│  └──────────┘     └──────────┘     └──────────┘        │');
  console.log('│        │                │                │             │');
  console.log('│        └────────────────┼────────────────┘             │');
  console.log('│                         ▼                              │');
  console.log('│                    结果存储/回调                        │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log();

  console.log('广度优先遍历 (BFS) 队列处理:');
  console.log('  深度 0: [种子URL]');
  console.log('  深度 1: [种子URL的所有链接]');
  console.log('  深度 2: [深度1页面的所有链接]');
  console.log('  ... 以此类推,直到达到最大深度');
  console.log();

  console.log('URL 去重机制:');
  console.log('  1. URL 规范化 (移除片段、排序参数等)');
  console.log('  2. 生成规范化 URL 的哈希指纹');
  console.log('  3. 双重检查: Set<规范化URL> + Set<指纹>');
  console.log('  4. 去重失败的 URL 不会加入队列');
  console.log();

  console.log('并发控制:');
  console.log('  - maxConcurrency: 同时运行的工作线程数');
  console.log('  - 每个线程独立处理一个任务');
  console.log('  - 线程池模式,任务完成后自动取下一个');
  console.log();

  console.log('限速机制:');
  console.log('  - rateLimit: 每秒最大请求数');
  console.log('  - 基于令牌桶/漏桶算法');
  console.log('  - 每个请求前检查时间间隔');
  console.log();

  console.log('错误重试:');
  console.log('  - 可重试状态码: 408, 429, 500, 502, 503, 504');
  console.log('  - 指数退避算法: delay = baseDelay * 2^attempt');
  console.log('  - maxRetries: 最大重试次数');
  console.log();

  const { createCrawler } = require('..');
  const crawler = createCrawler({
    maxConcurrency: 5,
    maxDepth: 3,
    rateLimit: 1000,
    requestTimeout: 30000,
    maxRetries: 3,
  });

  console.log('爬虫实例配置:');
  console.log('  maxConcurrency:', (crawler as any).options.maxConcurrency);
  console.log('  maxDepth:', (crawler as any).options.maxDepth);
  console.log('  rateLimit:', (crawler as any).options.rateLimit);
  console.log('  requestTimeout:', (crawler as any).options.requestTimeout);
  console.log('  maxRetries:', (crawler as any).options.maxRetries);
  console.log();

  console.log('事件系统:');
  console.log('  task-added: 任务加入队列时触发');
  console.log('  task-started: 任务开始处理时触发');
  console.log('  task-completed: 任务完成时触发');
  console.log('  task-failed: 任务失败时触发');
  console.log();
}

async function main() {
  await exampleHTMLParser();
  await exampleCSSSelector();
  await exampleExtraction();
  await exampleActionExecutor();
  await exampleURLUtils();
  await exampleCrawlerArchitecture();
}

main().catch(console.error);
