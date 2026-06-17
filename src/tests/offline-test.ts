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
    } else if (urlPath === '/products/1004' || urlPath === '/products/detail-1004') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'detail-1004.html');
    } else if (urlPath === '/products/1005' || urlPath === '/products/detail-1005') {
      filePath = path.join(TEST_PAGES_DIR, 'products', 'detail-1005.html');
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
  console.log('  离线测试：网页抓取框架完整功能演示（v2）');
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
    createCrawlConfig, CrawlConfigRunner,
    exportReport, exportItems, exportCrawl, exportItemsCSV,
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

    assert('后代选择器 .container .item', querySelectorAll(dom, '.container .item').length === 3);
    assert('子选择器 .container > p', querySelectorAll(dom, '.container > p').length === 1);
    assert('子选择器 .content > p', querySelectorAll(dom, '.content > p').length === 2);
    assert('相邻兄弟 h2 + span', querySelectorAll(dom, 'h2 + span').length === 1);
    assert('通用兄弟 h2 ~ p', querySelectorAll(dom, 'h2 ~ p').length === 1);
    assert('组合选择器 .container > ul.list > li.item.active', querySelectorAll(dom, '.container > ul.list > li.item.active').length === 1);
    assert(':first-child', textContent(querySelectorAll(dom, 'li:first-child')[0]).trim() === '第一项');
    assert(':last-child', textContent(querySelectorAll(dom, 'li:last-child')[0]).trim() === '第三项');
    assert(':nth-child(2)', textContent(querySelector(dom, 'li:nth-child(2)') || {} as any).trim() === '第二项');
    assert(':not(.active)', querySelectorAll(dom, 'li:not(.active)').length === 2);
    assert(':has(img)', querySelectorAll(dom, 'a:has(img)').length === 1);

    const sel = parseSelector('div.container > article.post h2.title:nth-child(2)');
    assert('选择器解析 parts 数', sel.parts.length === 3);
    assert('子选择器 combinator = >', sel.parts[1].combinator === '>');
    assert('后代选择器 combinator = 空格', sel.parts[2].combinator === ' ');
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
        id: selfAttrRule('id', 'data-id', { transform: (v: unknown) => parseInt(v as string, 10) }),
        category: selfDataRule('category', 'category'),
        name: textRule('name', '.product-name'),
        price: textRule('price', '.price'),
        detailLink: linkRule('detailLink', '.detail-link'),
      }),
    });
    const r1 = extractor.extract({ dom, baseUrl: BASE_URL, variables: {} }, schema1);
    const p1 = (r1.products as any[])[0];
    assert('selfAttrRule data-id', p1.id === 1001, `id=${p1.id}`);
    assert('selfDataRule category', p1.category === 'electronics', `cat=${p1.category}`);
    assert('嵌套名称提取', p1.name === 'iPhone 15 Pro');
    assert('嵌套链接提取', p1.detailLink === '/products/1001');

    // 2. 智能自身匹配: 普通选择器匹配到卡片自身
    const schema2 = createSchema({
      products: listRule('products', '.product', {
        productId: attrRule('productId', '.product', 'data-id', { transform: (v: unknown) => parseInt(v as string, 10) }),
        productCategory: dataRule('productCategory', '.product', 'category'),
        productClass: attrRule('productClass', '.product', 'class'),
        name: textRule('name', '.product-name'),
      }),
    });
    const r2 = extractor.extract({ dom, baseUrl: BASE_URL, variables: {} }, schema2);
    const p2_0 = (r2.products as any[])[0];
    const p2_1 = (r2.products as any[])[1];
    assert('智能匹配: attrRule(.product, data-id)', p2_0.productId === 1001, `id=${p2_0.productId}`);
    assert('智能匹配: dataRule(.product, category)', p2_0.productCategory === 'electronics');
    assert('智能匹配: attrRule(.product, class)', p2_0.productClass.includes('featured'));
    assert('智能匹配: 第二张卡片 data-id', p2_1.productId === 1002, `id=${p2_1.productId}`);

    // 3. self 类型提取
    const schema3 = createSchema({ cards: listRule('cards', '.product', { self: selfRule('self', '&self') }) });
    const r3 = extractor.extract({ dom, baseUrl: BASE_URL, variables: {} }, schema3);
    const c0 = (r3.cards as any[])[0].self;
    assert('self 提取 tagName', c0.tagName === 'article');
    assert('self 提取 className 包含 featured', c0.className.includes('featured'));
    assert('self 提取 data-id 属性', c0['data-id'] === '1001');
  }
  console.log();

  // ──── 测试3: URL 工具 ────
  console.log('━━━ 测试3: URL 工具 — 相对链接 & 去重 ━━━');
  {
    const base = `${BASE_URL}/products/page1`;
    assert('绝对路径 /about', resolveRelativeURL('/about', base) === `${BASE_URL}/about`);
    assert('相对路径 page2.html', resolveRelativeURL('page2.html', base) === `${BASE_URL}/products/page2.html`);
    assert('上级路径 ../about/index.html', resolveRelativeURL('../about/index.html', base) === `${BASE_URL}/about/index.html`);
    assert('移除片段 #section', !normalizeURL(`${BASE_URL}/products/page1#section`).includes('#'));

    const dedup = new URLDeduplicator();
    const u1 = `${BASE_URL}/products/page1?a=1&b=2`;
    const u2 = `${BASE_URL}/products/page1?b=2&a=1#section`;
    const u3 = `${BASE_URL}/products/page1?c=3&d=4`;
    dedup.markAsSeen(u1, normalizeURL(u1), urlToFingerprint(normalizeURL(u1)), 0);
    assert('去重: 相同URL不同参数顺序+片段', dedup.isSeen(u2, normalizeURL(u2), urlToFingerprint(normalizeURL(u2))));
    assert('去重: 不同参数不被去重', !dedup.isSeen(u3, normalizeURL(u3), urlToFingerprint(normalizeURL(u3))));
  }
  console.log();

  // ──── 测试4: Flaky 重试 + 完整重试链路 ────
  console.log('━━━ 测试4: 重试机制 — 完整链路 & 可恢复/永久失败区分 ━━━');
  {
    flakyRequestCount = 0;
    const config = createCrawlConfig('重试演示', [`${BASE_URL}/flaky`, `${BASE_URL}/broken`], {
      followLinks: false, maxDepth: 1, maxConcurrency: 1, rateLimit: 100,
      maxRetries: 3, retryDelay: 200,
    });
    const runner = new CrawlConfigRunner();
    const r = await runner.run(config);

    const flakySuccess = r.results.find((x: any) => x.url.includes('/flaky'));
    assert('flaky 页面最终成功', flakySuccess !== undefined, `status=${flakySuccess?.status}`);
    assert('flaky 页面重试过', flakySuccess?.retryCount > 0, `retryCount=${flakySuccess?.retryCount}`);

    const flakyRetryEntry = r.retryLog.find((x: any) => x.url.includes('/flaky'));
    assert('retryLog 有 flaky 条目', flakyRetryEntry !== undefined);
    if (flakyRetryEntry) {
      assert('flaky 每次 attempt 都记录', Array.isArray(flakyRetryEntry.attempts) && flakyRetryEntry.attempts.length >= 2, `attempts=${flakyRetryEntry.attempts?.length}`);
      assert('flaky 第一次是 500', flakyRetryEntry.attempts[0].httpStatus === 500, `status=${flakyRetryEntry.attempts[0]?.httpStatus}`);
      assert('flaky 第一次 attempt 标记可恢复', flakyRetryEntry.attempts[0].recoverable === true);
      assert('flaky 每次尝试都有时间戳', flakyRetryEntry.attempts.every((a: any) => typeof a.timestamp === 'number' && a.timestamp > 0));
      assert('flaky 最终状态 200', flakyRetryEntry.finalStatus === 200, `finalStatus=${flakyRetryEntry.finalStatus}`);
      assert('flaky 最终成功 finalSuccess=true', flakyRetryEntry.finalSuccess === true);
    }

    const brokenErr = r.errors.find((e: any) => e.url.includes('/broken'));
    assert('404 页面失败', brokenErr !== undefined, `error=${brokenErr?.error}`);
    assert('404 不可恢复', brokenErr ? !brokenErr.recoverable : false);
    assert('404 httpStatus=404', brokenErr ? brokenErr.httpStatus === 404 : false);

    console.log();
    console.log('  重试链路:');
    r.retryLog.forEach((e: any) => {
      console.log(`    ${e.url}  最终: ${e.finalSuccess ? `200成功 (HTTP ${e.finalStatus})` : `失败 ${e.finalError}`}`);
      e.attempts.forEach((a: any) => {
        console.log(`      ↻ attempt#${a.attempt} HTTP ${a.httpStatus}  ${a.recoverable ? '[可恢复]' : '[永久失败]'}  ${new Date(a.timestamp).toISOString().slice(11, 23)}  ${a.error}`);
      });
    });
  }
  console.log();

  // ──── 测试5: PageRule 细粒度跟链 + 管道视图 ────
  console.log('━━━ 测试5: 任务编排 — 按页面类型规则跟链 & 管道视图 ━━━');
  {
    const listExtract = createSchema({
      products: listRule('products', '.product', {
        id: attrRule('id', '.product', 'data-id', { transform: (v: unknown) => parseInt(v as string, 10) }),
        category: dataRule('category', '.product', 'category'),
        name: textRule('name', '.product-name'),
        price: textRule('price', '.price'),
      }),
    });

    const detailExtract = createSchema({
      id: attrRule('id', '.detail', 'data-id', { transform: (v: unknown) => parseInt(v as string, 10) }),
      title: textRule('title', '.product-title'),
      desc: textRule('desc', '.product-desc'),
      stock: textRule('stock', '.product-stock'),
    });

    const config = createCrawlConfig('商品列表+详情', [`${BASE_URL}/products/page1`], {
      maxDepth: 2, maxConcurrency: 2, rateLimit: 100, maxRetries: 1, retryDelay: 100,
      pageRules: [
        {
          pattern: '/products/page',
          extract: listExtract,
          followLinks: true,
          followLinkPatterns: [/\/products\/page/, /\/products\/10/],
          denyLinkPatterns: [/\/about/],
        },
        {
          pattern: '/products/10',
          extract: detailExtract,
          followLinks: false,
        },
      ],
      mergeBy: 'id',
    });

    const runner = new CrawlConfigRunner();
    const r = await runner.run(config);

    const listPages = r.results.filter((x: any) => x.pageType === '/products/page');
    const detailPages = r.results.filter((x: any) => x.pageType === '/products/10');
    const aboutPages = r.results.filter((x: any) => x.pageType === 'default' && x.url.includes('/about'));

    assert('配置名正确', r.configName === '商品列表+详情');
    assert('抓取到列表页', listPages.length >= 1, `${listPages.length} 个列表页`);
    assert('抓取到详情页', detailPages.length >= 3, `${detailPages.length} 个详情页`);
    assert('不抓取 about 页', aboutPages.length === 0, `${aboutPages.length} 个 about 页 (应为 0)`);
    assert('详情页 followLinks=false 不乱抓返回链接', detailPages.every((p: any) => !p.url.includes('page')) || detailPages.length <= 3, `详情页=${detailPages.length}`);

    assert('存在 linkPipeline', r.linkPipeline !== undefined);
    if (r.linkPipeline) {
      const lp = r.linkPipeline;
      assert('管道有 enqueued', lp.summary.enqueued > 0, `enqueued=${lp.summary.enqueued}`);
      assert('管道有 dedup', lp.summary.dedup >= 0, `dedup=${lp.summary.dedup}`);
      assert('管道有 deny (about)', lp.summary.deny > 0, `deny=${lp.summary.deny}`);
      assert('管道总条目 >= enqueued', lp.summary.total >= lp.summary.enqueued);
      assert('discovered 条目数 == summary.total', lp.discovered.length === lp.summary.total);
      assert('byReason 分组正确', Object.keys(lp.byReason).length > 0);

      const denied = lp.byReason.deny ?? [];
      assert('deny 条目是 /about', denied.every((e: any) => e.url.includes('/about')));

      const notAllowed = lp.byReason['not-allowed'] ?? [];
      assert('not-allowed 链接不含列表页或详情页模式', notAllowed.every((e: any) => !(e.url.includes('/products/page') || /\/products\/10/.test(e.url))));

      console.log();
      console.log('  管道视图汇总:');
      console.log(`    总发现链接: ${lp.summary.total}`);
      console.log(`    入队抓取: ${lp.summary.enqueued}`);
      console.log(`    被去重: ${lp.summary.dedup}`);
      console.log(`    被 denyLinkPatterns 拒绝: ${lp.summary.deny}`);
      console.log(`    不符合 followLinkPatterns: ${lp.summary.notAllowed}`);
      console.log(`    其他过滤: ${lp.summary.filter + lp.summary.depth + lp.summary.domain + lp.summary.nonHttp}`);
      console.log();
      console.log('  页面类型分布:');
      r.results.forEach((p: any, i: number) => {
        console.log(`    ${i + 1}. [${p.pageType}] ${p.url} — HTTP ${p.status}`);
      });
    }
  }
  console.log();

  // ──── 测试6: 数据合并 ────
  console.log('━━━ 测试6: 数据合并 — 列表页+详情页按 id 合并 ━━━');
  {
    const listExtract = createSchema({
      products: listRule('products', '.product', {
        id: attrRule('id', '.product', 'data-id', { transform: (v: unknown) => parseInt(v as string, 10) }),
        category: dataRule('category', '.product', 'category'),
        name: textRule('name', '.product-name'),
        price: textRule('price', '.price'),
      }),
    });
    const detailExtract = createSchema({
      id: attrRule('id', '.detail', 'data-id', { transform: (v: unknown) => parseInt(v as string, 10) }),
      title: textRule('title', '.product-title'),
      desc: textRule('desc', '.product-desc'),
      stock: textRule('stock', '.product-stock'),
    });
    const config = createCrawlConfig('合并测试', [`${BASE_URL}/products/page1`], {
      maxDepth: 2, maxConcurrency: 2, rateLimit: 100, maxRetries: 1,
      pageRules: [
        { pattern: '/products/page', extract: listExtract, followLinks: true, followLinkPatterns: [/\/products\/page/, /\/products\/10/], denyLinkPatterns: [/\/about/] },
        { pattern: '/products/10', extract: detailExtract, followLinks: false },
      ],
      mergeBy: 'id',
    });
    const runner = new CrawlConfigRunner();
    const r = await runner.run(config);

    assert('mergedItems 存在', r.mergedItems !== undefined, `${r.mergedItems?.length} 条`);
    if (r.mergedItems && r.mergedItems.length > 0) {
      const m0 = r.mergedItems[0] as any;
      assert('合并项有 id', m0.id !== undefined, `id=${m0.id}`);
      assert('合并项有列表字段 name', m0.name !== undefined, `name=${m0.name}`);
      assert('合并项有列表字段 price', m0.price !== undefined, `price=${m0.price}`);
      assert('合并项有详情字段 desc', m0.desc !== undefined, `desc=${typeof m0.desc === 'string' ? m0.desc.substring(0, 15) + '...' : m0.desc}`);
      assert('合并项有详情字段 stock', m0.stock !== undefined, `stock=${m0.stock}`);

      console.log();
      console.log('  合并结果:');
      r.mergedItems.forEach((m: any, i: number) => {
        console.log(`    ${i + 1}. id=${m.id}  name=${m.name || '(无)'}  desc=${m.desc ? (String(m.desc).substring(0, 18) + '...') : '(无)'}  stock=${m.stock || '(无)'}`);
      });
    }
  }
  console.log();

  // ──── 测试7: 动作执行 ────
  console.log('━━━ 测试7: 动作执行 — 搜索表单模拟 ━━━');
  {
    const html = `<form id="search-form"><input type="text" id="search-input" name="q" placeholder="搜索"><button type="submit" id="search-btn">搜索</button></form>`;
    const dom = parseHTML(html);
    const actions = createActionSequence([typeText('#search-input', 'MacBook'), click('#search-btn')]);
    const { ActionExecutor } = require('..');
    const ctx: any = { dom, variables: {}, results: {}, currentUrl: `${BASE_URL}/search`, delay: (ms: number) => new Promise(r => setTimeout(r, ms)) };
    const executor = new ActionExecutor();
    const res = await executor.execute(actions, ctx);
    assert('输入动作成功', res[0].success);
    assert('点击动作成功', res[1].success);
    const input = querySelector(dom, '#search-input') as any;
    assert('输入值正确', input?.attributes.value === 'MacBook');
  }
  console.log();

  // ──── 测试8: JSON 报告 + 多格式导出 ────
  console.log('━━━ 测试8: 报告导出 — 完整 JSON / 轻量 JSON / CSV ━━━');
  {
    flakyRequestCount = 0;
    const listExtract = createSchema({
      products: listRule('products', '.product', {
        id: attrRule('id', '.product', 'data-id', { transform: (v: unknown) => parseInt(v as string, 10) }),
        category: dataRule('category', '.product', 'category'),
        name: textRule('name', '.product-name'),
        price: textRule('price', '.price'),
      }),
    });
    const detailExtract = createSchema({
      id: attrRule('id', '.detail', 'data-id', { transform: (v: unknown) => parseInt(v as string, 10) }),
      title: textRule('title', '.product-title'),
      desc: textRule('desc', '.product-desc'),
      stock: textRule('stock', '.product-stock'),
    });
    const config = createCrawlConfig('报告导出综合测试', [`${BASE_URL}/products/page1`, `${BASE_URL}/flaky`, `${BASE_URL}/broken`], {
      maxDepth: 2, maxConcurrency: 2, rateLimit: 100, maxRetries: 3, retryDelay: 100,
      pageRules: [
        { pattern: '/products/page', extract: listExtract, followLinks: true, followLinkPatterns: [/\/products\/page/, /\/products\/10/], denyLinkPatterns: [/\/about/] },
        { pattern: '/products/10', extract: detailExtract, followLinks: false },
      ],
      mergeBy: 'id',
    });

    const runner = new CrawlConfigRunner();
    const r = await runner.run(config);

    const reportDir = path.resolve(__dirname, '../../reports');
    const reportPath = path.join(reportDir, 'crawl-report.json');
    const itemsJSONPath = path.join(reportDir, 'items.json');
    const itemsCSVPath = path.join(reportDir, 'items.csv');

    exportReport(r, reportPath);
    exportItems(r, itemsJSONPath);
    exportCrawl(r, itemsCSVPath, 'items-csv');

    assert('完整 JSON 报告文件存在', fs.existsSync(reportPath), reportPath);
    assert('轻量 items JSON 文件存在', fs.existsSync(itemsJSONPath), itemsJSONPath);
    assert('items CSV 文件存在', fs.existsSync(itemsCSVPath), itemsCSVPath);

    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      assert('报告有 configName', report.configName === '报告导出综合测试');
      assert('报告有 summary', report.summary && report.summary.pagesCrawled > 0);
      assert('报告有 pages 数组', Array.isArray(report.pages));
      assert('报告有 errors 数组', Array.isArray(report.errors));
      assert('报告有 retryLog 数组', Array.isArray(report.retryLog));
      assert('报告有 linkPipeline', report.linkPipeline !== undefined);
      assert('报告有 mergedItems', report.mergedItems !== undefined);

      const flakyPage = report.pages.find((p: any) => p.url.includes('/flaky'));
      assert('报告 flaky 页有 retryAttempts', flakyPage && Array.isArray(flakyPage.retryAttempts) && flakyPage.retryAttempts.length > 0);
      if (flakyPage?.retryAttempts?.length > 0) {
        assert('flaky 首次 HTTP 500', flakyPage.retryAttempts[0].httpStatus === 500);
        assert('flaky 首次可恢复', flakyPage.retryAttempts[0].recoverable === true);
        assert('flaky 首次有时间戳', typeof flakyPage.retryAttempts[0].timestamp === 'number');
      }

      const broken = report.errors.find((e: any) => e.url.includes('/broken'));
      assert('404 错误标记不可恢复', broken && broken.recoverable === false);

      assert('报告 errors 里有 broken', report.errors.length > 0);
    }

    if (fs.existsSync(itemsJSONPath)) {
      const items = JSON.parse(fs.readFileSync(itemsJSONPath, 'utf-8'));
      assert('轻量 JSON 是数组', Array.isArray(items));
      assert('轻量 JSON 有合并条目', items.length > 0);
      if (items.length > 0) {
        assert('轻量 JSON 首项有 id', items[0].id !== undefined);
        assert('轻量 JSON 首项有 name', items[0].name !== undefined);
        assert('轻量 JSON 首项有 desc', items[0].desc !== undefined);
      }
    }

    if (fs.existsSync(itemsCSVPath)) {
      const csvRaw = fs.readFileSync(itemsCSVPath, 'utf-8');
      assert('CSV 非空', csvRaw.length > 0);
      assert('CSV 以 BOM 开头', csvRaw.charCodeAt(0) === 0xFEFF);
      const csv = csvRaw.slice(1);
      const lines = csv.split('\n');
      assert('CSV 至少有表头 + 1 行', lines.length >= 2);
      const headerCols = lines[0].split(',');
      assert('CSV 表头包含 id', headerCols.includes('id'));
      assert('CSV 表头包含 name', headerCols.includes('name'));

      console.log();
      console.log(`  报告导出:`);
      console.log(`    完整报告 (${(fs.statSync(reportPath).size / 1024).toFixed(1)} KB): ${reportPath}`);
      console.log(`    items JSON (${(fs.statSync(itemsJSONPath).size / 1024).toFixed(1)} KB): ${itemsJSONPath}`);
      console.log(`    items CSV  (${(fs.statSync(itemsCSVPath).size / 1024).toFixed(1)} KB): ${itemsCSVPath}`);
      console.log();
      console.log(`  CSV 内容预览 (前 3 行):`);
      lines.slice(0, 3).forEach((l, i) => console.log(`    ${i + 1}. ${l.substring(0, 100)}${l.length > 100 ? '…' : ''}`));
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
