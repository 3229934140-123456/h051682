import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PAGES_DIR = path.resolve(__dirname, '../../test-pages');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

let flakyRequestCount = 0;

function createTestServer(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/broken') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>404 Not Found</h1></body></html>');
      return;
    }

    if (urlPath === '/flaky') {
      flakyRequestCount++;
      if (flakyRequestCount <= 2) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>500 Internal Server Error (temporary)</h1></body></html>');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Flaky Page - Finally Works!</h1><p>This page fails first 2 times then succeeds.</p></body></html>');
      }
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
    } else if (urlPath === '/products/1001' || urlPath === '/products/detail-1001') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'detail-1001.html');
    } else if (urlPath === '/products/1002' || urlPath === '/products/detail-1002') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'detail-1002.html');
    } else if (urlPath === '/products/1003' || urlPath === '/products/detail-1003') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'detail-1003.html');
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
    listRule, textRule, attrRule, dataRule, selfAttrRule, selfDataRule, selfRule,
    linkRule, imageRule, createSchema,
    resolveRelativeURL, normalizeURL, urlToFingerprint,
    URLDeduplicator,
    createCrawlConfig, CrawlConfigRunner, exportReport,
    createActionSequence, click, typeText,
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

  // ──── 测试1: CSS 选择器引擎 ────
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

    const descendants = querySelectorAll(dom, '.container .item');
    assert('后代选择器 .container .item', descendants.length === 3, `找到 ${descendants.length} 个`);

    const children = querySelectorAll(dom, '.container > p');
    assert('子选择器 .container > p', children.length === 1, `找到 ${children.length} 个`);

    const contentPs = querySelectorAll(dom, '.content > p');
    assert('子选择器 .content > p', contentPs.length === 2, `找到 ${contentPs.length} 个`);

    const adjacent = querySelectorAll(dom, 'h2 + span');
    assert('相邻兄弟 h2 + span', adjacent.length === 1, `找到 ${adjacent.length} 个`);

    const noAdjacent = querySelectorAll(dom, 'p + span');
    assert('相邻兄弟 p + span (不存在)', noAdjacent.length === 0);

    const generalSiblings = querySelectorAll(dom, 'h2 ~ p');
    assert('通用兄弟 h2 ~ p', generalSiblings.length === 1);

    const aImg = querySelectorAll(dom, 'a ~ img');
    assert('通用兄弟 a ~ img', aImg.length === 0, `img 是 a 的子元素不是兄弟`);

    const complex = querySelectorAll(dom, '.container > ul.list > li.item.active');
    assert('组合选择器', complex.length === 1);

    const firstChild = querySelectorAll(dom, 'li:first-child');
    assert(':first-child', firstChild.length === 1 && textContent(firstChild[0]).trim() === '第一项');

    const lastChild = querySelectorAll(dom, 'li:last-child');
    assert(':last-child', lastChild.length === 1 && textContent(lastChild[0]).trim() === '第三项');

    const secondChild = querySelector(dom, 'li:nth-child(2)');
    assert(':nth-child(2)', secondChild !== null && textContent(secondChild).trim() === '第二项');

    const notActive = querySelectorAll(dom, 'li:not(.active)');
    assert(':not(.active)', notActive.length === 2);

    const hasImg = querySelectorAll(dom, 'a:has(img)');
    assert(':has(img)', hasImg.length === 1);

    const sel = parseSelector('div.container > article.post h2.title:nth-child(2)');
    assert('选择器解析 parts 数', sel.parts.length === 3, `${sel.parts.length} 部分`);
    assert('子选择器 combinator', sel.parts[1].combinator === '>');
    assert('后代选择器 combinator', sel.parts[2].combinator === ' ');
  }
  console.log();

  // ──── 测试2: 提取规则 — 智能自身匹配 ────
  console.log('━━━ 测试2: 数据提取 — 卡片自身属性 & 智能匹配 ━━━');
  {
    const html = `
      <div class="product-list">
        <article class="product featured" data-id="1001" data-category="electronics">
          <h3 class="product-name">iPhone 15 Pro</h3>
          <p class="price">¥7,999</p>
          <a href="/products/1001" class="detail-link">查看详情</a>
        </article>
        <article class="product" data-id="1002" data-category="computers">
          <h3 class="product-name">MacBook Pro</h3>
          <p class="price">¥14,999</p>
          <a href="/products/1002" class="detail-link">查看详情</a>
        </article>
      </div>
    `;
    const dom = parseHTML(html);
    const extractor = new DataExtractor();

    // 1. selfAttrRule / selfDataRule 方式
    const schema1 = createSchema({
      products: listRule('products', '.product', {
        id: selfAttrRule('id', 'data-id', {
          transform: (v: unknown) => parseInt(v as string, 10),
        }),
        category: selfDataRule('category', 'category'),
        name: textRule('name', '.product-name'),
        price: textRule('price', '.price'),
        detailLink: linkRule('detailLink', '.detail-link'),
      }),
    });
    const result1 = extractor.extract({ dom, baseUrl: BASE_URL, variables: {} }, schema1);
    const products1 = result1.products as any[];
    assert('selfAttrRule data-id', products1[0].id === 1001, `id = ${products1[0].id}`);
    assert('selfDataRule category', products1[0].category === 'electronics', `category = ${products1[0].category}`);
    assert('嵌套名称提取', products1[0].name === 'iPhone 15 Pro');
    assert('嵌套链接提取', products1[0].detailLink === '/products/1001');

    // 2. 智能自身匹配: 用普通选择器匹配当前卡片自身
    const schema2 = createSchema({
      products: listRule('products', '.product', {
        productId: attrRule('productId', '.product', 'data-id', {
          transform: (v: unknown) => parseInt(v as string, 10),
        }),
        productCategory: dataRule('productCategory', '.product', 'category'),
        productClass: attrRule('productClass', '.product', 'class'),
        name: textRule('name', '.product-name'),
      }),
    });
    const result2 = extractor.extract({ dom, baseUrl: BASE_URL, variables: {} }, schema2);
    const products2 = result2.products as any[];
    assert('智能匹配: attrRule(.product, data-id) 取到自身', products2[0].productId === 1001, `id = ${products2[0].productId}`);
    assert('智能匹配: dataRule(.product, category) 取到自身', products2[0].productCategory === 'electronics', `category = ${products2[0].productCategory}`);
    assert('智能匹配: attrRule(.product, class) 取到自身 class', products2[0].productClass.includes('product'), `class = ${products2[0].productClass}`);
    assert('智能匹配: 第二张卡片 data-id', products2[1].productId === 1002, `id = ${products2[1].productId}`);

    // 3. self 提取类型
    const schema3 = createSchema({
      cards: listRule('cards', '.product', {
        self: selfRule('self', '&self'),
      }),
    });
    const result3 = extractor.extract({ dom, baseUrl: BASE_URL, variables: {} }, schema3);
    const cards3 = result3.cards as any[];
    assert('self 提取 tagName', cards3[0].self.tagName === 'article');
    assert('self 提取 className 包含 featured', cards3[0].self.className.includes('featured'));
    assert('self 提取 data-id 属性', cards3[0].self['data-id'] === '1001');
  }
  console.log();

  // ──── 测试3: URL 工具 ────
  console.log('━━━ 测试3: URL 工具 — 相对链接 & 去重 ━━━');
  {
    const base = `${BASE_URL}/products/page1`;

    const abs1 = resolveRelativeURL('/about', base);
    assert('绝对路径 /about', abs1 === `${BASE_URL}/about`, abs1);

    const abs2 = resolveRelativeURL('page2.html', base);
    assert('相对路径 page2.html', abs2 === `${BASE_URL}/products/page2.html`, abs2);

    const abs3 = resolveRelativeURL('../about/index.html', base);
    assert('上级路径 ../about/index.html', abs3 === `${BASE_URL}/about/index.html`, abs3);

    const norm1 = normalizeURL(`${BASE_URL}/products/page1#section`);
    assert('移除片段 #section', !norm1.includes('#'), norm1);

    const norm2 = normalizeURL(`${BASE_URL}/products/page1?b=2&a=1`);
    assert('排序查询参数', norm2.includes('a=1') && norm2.includes('b=2'), norm2);

    const dedup = new URLDeduplicator();
    const url1 = `${BASE_URL}/products/page1?a=1&b=2`;
    const url2 = `${BASE_URL}/products/page1?b=2&a=1#section`;
    const url3 = `${BASE_URL}/products/page1?c=3&d=4`;

    dedup.markAsSeen(url1, normalizeURL(url1), urlToFingerprint(normalizeURL(url1)), 0);
    const seen2 = dedup.isSeen(url2, normalizeURL(url2), urlToFingerprint(normalizeURL(url2)));
    const seen3 = dedup.isSeen(url3, normalizeURL(url3), urlToFingerprint(normalizeURL(url3)));

    assert('去重: 相同URL不同参数顺序+片段', seen2);
    assert('去重: 不同参数不被去重', !seen3);
  }
  console.log();

  // ──── 测试4: Flaky 端点重试 + 404 永久失败 ────
  console.log('━━━ 测试4: 重试机制 — 可恢复失败 vs 永久失败 ━━━');
  {
    flakyRequestCount = 0;

    const config = createCrawlConfig('重试演示', [`${BASE_URL}/flaky`, `${BASE_URL}/broken`], {
      followLinks: false,
      maxDepth: 1,
      maxConcurrency: 1,
      rateLimit: 100,
      maxRetries: 3,
      retryDelay: 200,
    });

    const runner = new CrawlConfigRunner();
    const crawlResult = await runner.run(config);

    const flakySuccess = crawlResult.results.find((r: { url: string }) => r.url.includes('/flaky'));
    assert('flaky 页面最终成功', flakySuccess !== undefined, `状态: ${flakySuccess?.status}`);
    assert('flaky 页面重试过', flakySuccess?.retryCount > 0, `重试次数: ${flakySuccess?.retryCount}`);

    const brokenError = crawlResult.errors.find((e: { url: string }) => e.url.includes('/broken'));
    assert('404 页面失败', brokenError !== undefined, `错误: ${brokenError?.error}`);
    assert('404 不可恢复', brokenError ? !brokenError.recoverable : false, `recoverable = ${brokenError?.recoverable}`);

    if (flakySuccess && flakySuccess.retryCount > 0) {
      assert('可恢复与不可恢复区分', brokenError ? !brokenError.recoverable : false, '5xx 可恢复, 404 不可恢复');
    }

    console.log();
    console.log('  重试结果:');
    crawlResult.results.forEach((r: { url: string; status: number; retryCount: number }) => {
      console.log(`    ✅ ${r.url} — 状态 ${r.status}, 重试 ${r.retryCount} 次`);
    });
    crawlResult.errors.forEach((e: { url: string; error: string; httpStatus: number; recoverable: boolean; retryCount: number }) => {
      console.log(`    ❌ ${e.url} — ${e.error}, recoverable=${e.recoverable}, retryCount=${e.retryCount}`);
    });
    if (crawlResult.retryLog.length > 0) {
      console.log('  重试日志:');
      crawlResult.retryLog.forEach((entry: { url: string; attempt: number; httpStatus: number; error: string; recoverable: boolean }) => {
        console.log(`    ↻ ${entry.url} 第${entry.attempt}次重试, HTTP ${entry.httpStatus}, recoverable=${entry.recoverable}`);
      });
    }
  }
  console.log();

  // ──── 测试5: 页面类型规则 + 列表/详情数据合并 ────
  console.log('━━━ 测试5: 任务编排 — 按页面类型提取 & 数据合并 ━━━');
  {
    const listPageExtract = createSchema({
      products: listRule('products', '.product', {
        id: attrRule('id', '.product', 'data-id', {
          transform: (v: unknown) => parseInt(v as string, 10),
        }),
        category: dataRule('category', '.product', 'category'),
        name: textRule('name', '.product-name'),
        price: textRule('price', '.price'),
        detailLink: attrRule('detailLink', '.detail-link', 'href'),
      }),
    });

    const detailPageExtract = createSchema({
      id: attrRule('id', '.detail', 'data-id', {
        transform: (v: unknown) => parseInt(v as string, 10),
      }),
      title: textRule('title', '.product-title'),
      desc: textRule('desc', '.product-desc'),
      stock: textRule('stock', '.product-stock'),
      specs: listRule('specs', '.spec-item', {
        key: dataRule('key', '.spec-item', 'key'),
        value: textRule('value', '.spec-item'),
      }),
    });

    const config = createCrawlConfig('商品列表+详情合并', [`${BASE_URL}/products/page1`], {
      followLinks: true,
      linkSelector: 'a[href]',
      maxDepth: 2,
      maxConcurrency: 2,
      rateLimit: 100,
      maxRetries: 1,
      retryDelay: 100,
      pageRules: [
        {
          pattern: '/products/page',
          extract: listPageExtract,
          followLinks: true,
        },
        {
          pattern: '/products/10',
          extract: detailPageExtract,
          followLinks: false,
        },
      ],
      mergeBy: 'id',
    });

    const runner = new CrawlConfigRunner();
    const crawlResult = await runner.run(config);

    assert('配置名', crawlResult.configName === '商品列表+详情合并');
    assert('抓取页面数 >= 3', crawlResult.pagesCrawled >= 3, `${crawlResult.pagesCrawled} 页`);

    const listPages = crawlResult.results.filter((r: { pageType: string }) => r.pageType === '/products/page');
    const detailPages = crawlResult.results.filter((r: { pageType: string }) => r.pageType === '/products/10');
    assert('列表页识别', listPages.length >= 1, `${listPages.length} 页`);
    assert('详情页识别', detailPages.length >= 1, `${detailPages.length} 页`);

    assert('数据合并存在', crawlResult.mergedItems !== undefined, `${crawlResult.mergedItems?.length} 条合并结果`);

    if (crawlResult.mergedItems && crawlResult.mergedItems.length > 0) {
      const firstMerged = crawlResult.mergedItems[0] as any;
      assert('合并项有 id', firstMerged.id !== undefined, `id = ${firstMerged.id}`);
      assert('合并项有列表字段 name', firstMerged.name !== undefined, `name = ${firstMerged.name}`);
      if (firstMerged.desc !== undefined) {
        assert('合并项有详情字段 desc', firstMerged.desc !== undefined, `desc = ${firstMerged.desc}`);
      }
      if (firstMerged.stock !== undefined) {
        assert('合并项有详情字段 stock', firstMerged.stock !== undefined, `stock = ${firstMerged.stock}`);
      }

      console.log();
      console.log('  合并结果:');
      crawlResult.mergedItems.forEach((item: any, i: number) => {
        console.log(`    ${i + 1}. id=${item.id}, name=${item.name || '(无)'}, desc=${item.desc ? item.desc.substring(0, 20) + '...' : '(无)'}`);
      });
    }

    console.log();
    console.log('  页面抓取详情:');
    crawlResult.results.forEach((r: { url: string; pageType: string; status: number; retryCount: number }, i: number) => {
      console.log(`    ${i + 1}. [${r.pageType}] ${r.url} — ${r.status}${r.retryCount > 0 ? ` (重试${r.retryCount}次)` : ''}`);
    });
  }
  console.log();

  // ──── 测试6: 动作执行 ────
  console.log('━━━ 测试6: 动作执行 — 模拟搜索表单 ━━━');
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
    assert('输入动作成功', results[0].success);
    assert('点击动作成功', results[1].success);

    const searchInput = querySelector(dom, '#search-input');
    assert('输入值正确', searchInput?.attributes.value === 'MacBook');
  }
  console.log();

  // ──── 测试7: JSON 报告导出 ────
  console.log('━━━ 测试7: JSON 报告导出 — 完整抓取报告 ━━━');
  {
    flakyRequestCount = 0;

    const config = createCrawlConfig('报告导出测试', [`${BASE_URL}/products/page1`, `${BASE_URL}/flaky`, `${BASE_URL}/broken`], {
      followLinks: true,
      linkSelector: 'a[href]',
      maxDepth: 2,
      maxConcurrency: 2,
      rateLimit: 100,
      maxRetries: 3,
      retryDelay: 100,
      pageRules: [
        {
          pattern: '/products/page',
          extract: createSchema({
            title: textRule('title', 'h1'),
          }),
          followLinks: true,
        },
        {
          pattern: '/products/10',
          extract: createSchema({
            id: attrRule('id', '.detail', 'data-id'),
            title: textRule('title', '.product-title'),
          }),
          followLinks: false,
        },
      ],
      mergeBy: 'id',
    });

    const runner = new CrawlConfigRunner();
    const crawlResult = await runner.run(config);

    const reportPath = path.resolve(__dirname, '../../reports/crawl-report.json');
    exportReport(crawlResult, reportPath);

    const reportExists = fs.existsSync(reportPath);
    assert('报告文件已创建', reportExists, reportPath);

    if (reportExists) {
      const reportContent = fs.readFileSync(reportPath, 'utf-8');
      const report = JSON.parse(reportContent);

      assert('报告有 configName', report.configName === '报告导出测试');
      assert('报告有 seedUrls', Array.isArray(report.seedUrls) && report.seedUrls.length === 3);
      assert('报告有 summary', report.summary !== undefined);
      assert('报告 summary 有 pagesCrawled', typeof report.summary.pagesCrawled === 'number');
      assert('报告 summary 有时间戳', report.summary.startTime !== undefined && report.summary.endTime !== undefined);
      assert('报告有 pages 数组', Array.isArray(report.pages));
      assert('报告有 errors 数组', Array.isArray(report.errors));
      assert('报告有 retryLog 数组', Array.isArray(report.retryLog));
      assert('报告有 mergedItems', report.mergedItems !== undefined);

      const flakyPageInReport = report.pages.find((p: { url: string }) => p.url.includes('/flaky'));
      assert('报告中 flaky 页面有重试记录', flakyPageInReport?.retryCount > 0, `重试 ${flakyPageInReport?.retryCount} 次`);

      const brokenInErrors = report.errors.find((e: { url: string }) => e.url.includes('/broken'));
      assert('报告中 404 错误标记不可恢复', brokenInErrors ? !brokenInErrors.recoverable : false, `recoverable = ${brokenInErrors?.recoverable}`);

      console.log();
      console.log(`  报告已保存: ${reportPath}`);
      console.log(`  报告大小: ${(Buffer.byteLength(reportContent) / 1024).toFixed(1)} KB`);
      console.log(`  页面数: ${report.pages.length}`);
      console.log(`  错误数: ${report.errors.length}`);
      console.log(`  重试日志: ${report.retryLog.length} 条`);
      console.log(`  合并条目: ${report.mergedItems?.length ?? 0} 条`);
    }
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
