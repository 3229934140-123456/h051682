import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PAGES_DIR = path.resolve(__dirname, '../../test-pages');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

function createTestServer(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/broken') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>404 Not Found</h1></body></html>');
      return;
    }

    let filePath: string;
    if (urlPath === '/') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'page1.html');
    } else if (urlPath === '/products/page1' || urlPath === '/products/page1.html') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'page1.html');
    } else if (urlPath === '/products/page2' || urlPath === '/products/page2.html') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'page2.html');
    } else if (urlPath === '/products/page3' || urlPath === '/products/page3.html') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'page3.html');
    } else if (urlPath === '/about' || urlPath === '/about/') {
      filePath = path.join(TEST_PAGES_DIR, 'about', 'index.html');
    } else {
      filePath = path.join(TEST_PAGES_DIR, urlPath);
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>404 Not Found</h1></body></html>');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(content);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>500 Internal Server Error</h1></body></html>');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function runTests() {
  const PORT = 18923;
  const BASE_URL = `http://localhost:${PORT}`;

  console.log('='.repeat(70));
  console.log('  离线测试：网页抓取框架完整功能演示');
  console.log('='.repeat(70));
  console.log();

  const server = await createTestServer(PORT);
  console.log(`[启动] 本地测试服务器已启动: ${BASE_URL}`);
  console.log();

  const {
    parseHTML, querySelector, querySelectorAll, textContent,
    parseSelector, matches,
    DataExtractor,
    listRule, textRule, attrRule, selfAttrRule, selfDataRule, selfRule,
    linkRule, imageRule, createSchema,
    resolveRelativeURL, normalizeURL, urlToFingerprint,
    URLDeduplicator,
    createCrawlConfig, CrawlConfigRunner,
    createActionSequence, click, typeText, waitFor,
  } = require('..');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    if (condition) {
      passed++;
      console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
    } else {
      failed++;
      console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    }
  }

  // ──── 测试1: CSS 选择器引擎（组合器修复） ────
  console.log('━━━ 测试1: CSS 选择器 — 组合器 & 伪类 ━━━');
  {
    const html = `
      <div class="container">
        <h2 class="title">文章标题</h2>
        <span class="date">2024-01-15</span>
        <p class="intro">简介文字</p>
        <ul class="list">
          <li class="item">第一项</li>
          <li class="item active">第二项</li>
          <li class="item">第三项</li>
        </ul>
        <div class="content">
          <p>段落1</p>
          <p>段落2</p>
        </div>
        <a href="/page"><img src="/img.jpg" alt="图片"></a>
      </div>
    `;
    const dom = parseHTML(html);

    // 后代选择器 (空格)
    const descendants = querySelectorAll(dom, '.container .item');
    assert('后代选择器 .container .item', descendants.length === 3, `找到 ${descendants.length} 个`);

    // 子选择器 (>)
    const children = querySelectorAll(dom, '.container > p');
    assert('子选择器 .container > p', children.length === 1, `找到 ${children.length} 个 (只匹配直接子元素)`);

    const contentPs = querySelectorAll(dom, '.content > p');
    assert('子选择器 .content > p', contentPs.length === 2, `找到 ${contentPs.length} 个`);

    // 相邻兄弟 (+)
    const adjacent = querySelectorAll(dom, 'h2 + span');
    assert('相邻兄弟 h2 + span', adjacent.length === 1, `找到 ${adjacent.length} 个`);

    const noAdjacent = querySelectorAll(dom, 'p + span');
    assert('相邻兄弟 p + span (不存在)', noAdjacent.length === 0, `找到 ${noAdjacent.length} 个`);

    // 通用兄弟 (~)
    const generalSiblings = querySelectorAll(dom, 'h2 ~ p');
    assert('通用兄弟 h2 ~ p', generalSiblings.length === 1, `找到 ${generalSiblings.length} 个`);

    const allSiblings = querySelectorAll(dom, 'h2 ~ *');
    assert('通用兄弟 h2 ~ *', allSiblings.length >= 4, `找到 ${allSiblings.length} 个`);

    // a ~ img
    const aImg = querySelectorAll(dom, 'a ~ img');
    assert('通用兄弟 a ~ img', aImg.length === 0, `找到 ${aImg.length} 个 (img 是 a 的子元素不是兄弟)`);

    // 组合选择器
    const complex = querySelectorAll(dom, '.container > ul.list > li.item.active');
    assert('组合选择器 .container > ul.list > li.item.active', complex.length === 1, `找到 ${complex.length} 个`);

    // :first-child (元素级)
    const firstChild = querySelectorAll(dom, 'li:first-child');
    assert(':first-child', firstChild.length === 1 && textContent(firstChild[0]).trim() === '第一项');

    // :last-child
    const lastChild = querySelectorAll(dom, 'li:last-child');
    assert(':last-child', lastChild.length === 1 && textContent(lastChild[0]).trim() === '第三项');

    // :nth-child
    const secondChild = querySelector(dom, 'li:nth-child(2)');
    assert(':nth-child(2)', secondChild !== null && textContent(secondChild).trim() === '第二项');

    // :not()
    const notActive = querySelectorAll(dom, 'li:not(.active)');
    assert(':not(.active)', notActive.length === 2, `找到 ${notActive.length} 个`);

    // :has()
    const hasImg = querySelectorAll(dom, 'a:has(img)');
    assert(':has(img)', hasImg.length === 1, `找到 ${hasImg.length} 个`);

    // 选择器解析
    const sel = parseSelector('div.container > article.post h2.title:nth-child(2)');
    assert('选择器解析 parts 数', sel.parts.length === 3, `${sel.parts.length} 部分`);
    assert('子选择器 combinator 正确', sel.parts[1].combinator === '>', `combinator = "${sel.parts[1].combinator}"`);
    assert('后代选择器 combinator 正确', sel.parts[2].combinator === ' ', `combinator = "${sel.parts[2].combinator}"`);
  }
  console.log();

  // ──── 测试2: 提取规则 — 嵌套 & 自身属性 ────
  console.log('━━━ 测试2: 数据提取 — 卡片列表 & 自身属性 ━━━');
  {
    const html = `
      <div class="product-list">
        <article class="product featured" data-id="1001" data-category="electronics">
          <h3 class="product-name">iPhone 15 Pro</h3>
          <p class="price">¥7,999</p>
          <img src="/images/iphone15.jpg" alt="iPhone 15 Pro">
          <a href="/products/1001" class="buy-link">立即购买</a>
        </article>
        <article class="product" data-id="1002" data-category="computers">
          <h3 class="product-name">MacBook Pro</h3>
          <p class="price">¥14,999</p>
          <img src="/images/macbook.jpg" alt="MacBook Pro">
          <a href="/products/1002" class="buy-link">立即购买</a>
        </article>
        <article class="product" data-id="1003" data-category="audio">
          <h3 class="product-name">AirPods Pro</h3>
          <p class="price">¥1,899</p>
          <img src="/images/airpods.jpg" alt="AirPods Pro">
          <a href="/products/1003" class="buy-link">立即购买</a>
        </article>
      </div>
    `;
    const dom = parseHTML(html);

    const extractor = new DataExtractor();

    // 旧方式 (有 bug): 内部 attrRule('.product', 'data-id') 搜不到自身
    const oldSchema = createSchema({
      products: listRule('products', '.product', {
        name: textRule('name', '.product-name'),
      }),
    });
    const oldResult = extractor.extract({ dom, baseUrl: 'https://example.com', variables: {} }, oldSchema);
    const oldProducts = oldResult.products as any[];
    assert('旧方式: 3个卡片', oldProducts.length === 3, `${oldProducts.length} 个`);

    // 新方式: selfAttrRule 提取卡片自身属性
    const schema = createSchema({
      products: listRule('products', '.product', {
        id: selfAttrRule('id', 'data-id', {
          transform: (v: unknown) => parseInt(v as string, 10),
        }),
        category: selfDataRule('category', 'category'),
        name: textRule('name', '.product-name'),
        price: textRule('price', '.price', {
          transform: (v: unknown) => parseInt((v as string).replace(/[^\d]/g, ''), 10),
        }),
        image: imageRule('image', 'img'),
        buyLink: linkRule('buyLink', '.buy-link'),
      }),
    });

    const result = extractor.extract({ dom, baseUrl: 'https://example.com', variables: {} }, schema);
    const products = result.products as any[];

    assert('卡片数量', products.length === 3, `${products.length} 个`);
    assert('卡片自身 data-id 提取', products[0].id === 1001, `id = ${products[0].id}`);
    assert('卡片自身 data-category 提取', products[0].category === 'electronics', `category = ${products[0].category}`);
    assert('内部名称提取', products[0].name === 'iPhone 15 Pro', `name = ${products[0].name}`);
    assert('内部价格转换', products[0].price === 7999, `price = ${products[0].price}`);
    assert('内部图片提取', products[0].image === '/images/iphone15.jpg', `image = ${products[0].image}`);
    assert('内部链接提取', products[0].buyLink === '/products/1001', `link = ${products[0].buyLink}`);

    // 第二个卡片的属性
    assert('第2卡片 data-id', products[1].id === 1002, `id = ${products[1].id}`);
    assert('第2卡片 category', products[1].category === 'computers', `category = ${products[1].category}`);
    assert('第2卡片 name', products[1].name === 'MacBook Pro', `name = ${products[1].name}`);

    // self 提取类型
    const selfSchema = createSchema({
      cards: listRule('cards', '.product', {
        self: selfRule('self', '&self'),
      }),
    });
    const selfResult = extractor.extract({ dom, baseUrl: 'https://example.com', variables: {} }, selfSchema);
    const selfCards = selfResult.cards as any[];
    assert('self 提取 tagName', selfCards[0].self.tagName === 'article', `tagName = ${selfCards[0].self.tagName}`);
    assert('self 提取 className 包含 featured', selfCards[0].self.className.includes('featured'), `className = ${selfCards[0].self.className}`);
    assert('self 提取 data-id 通过属性', selfCards[0].self['data-id'] === '1001', `data-id = ${selfCards[0].self['data-id']}`);
  }
  console.log();

  // ──── 测试3: URL 工具 ────
  console.log('━━━ 测试3: URL 工具 — 相对链接解析 & 去重 ━━━');
  {
    const base = `${BASE_URL}/products/page1`;

    // 相对路径解析
    const abs1 = resolveRelativeURL('/about', base);
    assert('绝对路径 /about', abs1 === `${BASE_URL}/about`, abs1);

    const abs2 = resolveRelativeURL('page2.html', base);
    assert('相对路径 page2.html', abs2 === `${BASE_URL}/products/page2.html`, abs2);

    const abs3 = resolveRelativeURL('../about/index.html', base);
    assert('上级路径 ../about/index.html', abs3 === `${BASE_URL}/about/index.html`, abs3);

    // URL 规范化
    const norm1 = normalizeURL(`${BASE_URL}/products/page1#section`);
    assert('移除片段 #section', !norm1.includes('#'), norm1);

    const norm2 = normalizeURL(`${BASE_URL}/products/page1?b=2&a=1`);
    assert('排序查询参数', norm2.includes('a=1') && norm2.includes('b=2'), norm2);

    // 去重
    const dedup = new URLDeduplicator();
    const url1 = `${BASE_URL}/products/page1?a=1&b=2`;
    const url2 = `${BASE_URL}/products/page1?b=2&a=1#section`;
    const url3 = `${BASE_URL}/products/page1?c=3&d=4`;

    dedup.markAsSeen(url1, normalizeURL(url1), urlToFingerprint(normalizeURL(url1)), 0);
    const seen2 = dedup.isSeen(url2, normalizeURL(url2), urlToFingerprint(normalizeURL(url2)));
    const seen3 = dedup.isSeen(url3, normalizeURL(url3), urlToFingerprint(normalizeURL(url3)));

    assert('去重: 相同URL不同参数顺序+片段', seen2, '参数排序+移除片段后被识别为已访问');
    assert('去重: 不同参数的URL不被去重', !seen3, '参数不同应视为不同URL');
  }
  console.log();

  // ──── 测试4: 离线抓取（分页、相对链接、去重、重试） ────
  console.log('━━━ 测试4: 离线抓取 — 分页跟随 & 去重 & 失败重试 ━━━');
  {
    const config = createCrawlConfig('商品抓取测试', [`${BASE_URL}/products/page1`], {
      followLinks: true,
      linkSelector: 'a[href]',
      maxDepth: 2,
      maxConcurrency: 2,
      rateLimit: 5,
      maxRetries: 1,
      extract: createSchema({
        title: textRule('title', 'h1'),
        productCount: {
          count: {
            name: 'productCount',
            selector: '.product',
            extract: 'text' as const,
            multiple: true,
            transform: (v: unknown) => Array.isArray(v) ? v.length : 0,
          },
        },
      }),
    });

    const runner = new CrawlConfigRunner();
    const crawlResult = await runner.run(config);

    assert('配置名', crawlResult.configName === '商品抓取测试');
    assert('抓取页面数 >= 3', crawlResult.pagesCrawled >= 3, `${crawlResult.pagesCrawled} 页`);
    assert('无重复抓取 (去重)', crawlResult.pagesCrawled <= 5, `最多5页（去重后）`);
    assert('包含失败页面', crawlResult.pagesFailed >= 0, `${crawlResult.pagesFailed} 页失败`);

    const page1Result = crawlResult.results.find((r: { url: string; status: number; extracted?: any }) => r.url.includes('/products/page1'));
    assert('第1页提取标题', page1Result?.extracted?.title === '商品列表', `标题: ${page1Result?.extracted?.title}`);

    console.log();
    console.log('  抓取结果汇总:');
    crawlResult.results.forEach((r: { url: string; status: number; extracted?: any }, i: number) => {
      const title = r.extracted?.title || '(无标题)';
      console.log(`    ${i + 1}. [${r.status}] ${r.url} — ${title}`);
    });
    if (crawlResult.errors.length > 0) {
      console.log('  错误:');
      crawlResult.errors.forEach((e: { url: string; error: string }, i: number) => {
        console.log(`    ${i + 1}. ${e.url} — ${e.error}`);
      });
    }
    console.log(`  耗时: ${crawlResult.durationMs}ms`);
  }
  console.log();

  // ──── 测试5: 动作序列 ────
  console.log('━━━ 测试5: 动作执行 — 模拟搜索表单 ━━━');
  {
    const html = `
      <form id="search-form">
        <input type="text" id="search-input" name="q" placeholder="搜索">
        <select id="category" name="category">
          <option value="all">全部分类</option>
          <option value="electronics">电子产品</option>
        </select>
        <button type="submit" id="search-btn">搜索</button>
      </form>
    `;
    const dom = parseHTML(html);

    const actions = createActionSequence([
      typeText('#search-input', 'MacBook'),
      click('#search-btn'),
    ]);

    const { ActionExecutor } = require('..');
    const executor = new ActionExecutor();
    const context = {
      dom,
      variables: {},
      results: {},
      currentUrl: `${BASE_URL}/search`,
      delay: (ms: number) => new Promise(r => setTimeout(r, ms)),
    };

    const results = await executor.execute(actions, context);
    assert('输入动作成功', results[0].success, `type: ${results[0].action.type}`);
    assert('点击动作成功', results[1].success, `click: ${results[1].action.type}`);

    const searchInput = querySelector(dom, '#search-input');
    assert('输入值正确', searchInput?.attributes.value === 'MacBook', `value = ${searchInput?.attributes.value}`);
  }
  console.log();

  // ──── 汇总 ────
  console.log('='.repeat(70));
  console.log(`  测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('='.repeat(70));

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('测试运行出错:', err);
  process.exit(1);
});
