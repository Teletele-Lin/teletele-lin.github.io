// Integration test in Chromium, with every GitHub API request mocked.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright-core');
const { MockGit } = require('./admin-mock.cjs');
const root = path.resolve(__dirname, '../docs');
const catalogPath = 'docs/assets/catalog.json';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5o8AAAAASUVORK5CYII=', 'base64');
const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type,accept,x-github-api-version',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'content-type': 'application/json'
};

test('self-hosted admin: articles, publishing, clipboard images, topics and conflict handling', async () => {
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
            if (!file.startsWith(root + path.sep)) { res.writeHead(404); return res.end(); }
            const bytes = await fs.readFile(file);
            res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
            res.end(bytes);
        } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    const mock = new MockGit();
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true });
        const context = await browser.newContext({ viewport: { width: 1460, height: 940 }, permissions: ['clipboard-read', 'clipboard-write'] });
        await context.route('https://api.github.com/**', async route => {
            const request = route.request();
            if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
            assert.equal(request.headers().authorization, 'Bearer mock-token');
            const [status, body] = mock.handle(request.url(), request.method(), request.postData() ? request.postDataJSON() : undefined);
            return route.fulfill({ status, headers: cors, body: JSON.stringify(body) });
        });
        await context.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        const url = 'http://127.0.0.1:' + server.address().port + '/admin/index.html';
        await page.goto(url);
        await page.locator('#token').fill('mock-token');
        await page.locator('#connect').click();
        await page.locator('#workspace').waitFor({ state: 'visible' });
        await page.locator('#busy-indicator').waitFor({ state: 'hidden' });
        const initialFiles = [...mock.currentTree().keys()];
        assert.equal(await page.locator('#article-count').textContent(), String(initialFiles.filter(p => /^docs\/blogs\/.+\.md$/.test(p) && !p.endsWith('/overview.md')).length));
        assert.equal(await page.locator('#media-count').textContent(), String(initialFiles.filter(p => /^docs\/assets\/uploads\/.+\.(png|jpe?g|webp|gif|avif)$/i.test(p)).length));
        assert.equal(await page.locator('#token').inputValue(), '');
        assert.equal(await page.evaluate(() => Object.values(localStorage).some(v => v.includes('mock-token')) || Object.values(sessionStorage).some(v => v.includes('mock-token'))), false);
        await page.locator('#article-list button').filter({ hasText: '优化器' }).click();
        await page.locator('#article-form').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#article-title').inputValue(), '优化器');
        assert.match(await page.locator('#article-body').inputValue(), /GDB/);
        assert.match(await page.locator('#article-dates').textContent(), /创建于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
        assert.equal(await page.locator('#article-author').getAttribute('placeholder'), 'Teletele');

        await page.clock.setFixedTime(new Date('2026-11-26T01:20:59Z'));
        await page.locator('#new-article').click();
        await page.locator('#article-title').fill('测试新文章');
        await page.locator('#article-description').fill('测试摘要');
        await page.locator('#article-body').fill('# 测试标题\n\n**正文**\n\n<script>window.evil=1</script>');
        await page.locator('#article-preview strong').waitFor();
        assert.equal(await page.evaluate(() => window.evil), undefined);
        assert.equal(await page.locator('#article-preview script').count(), 0);
        await page.locator('#article-form details summary').click();
        await page.locator('#article-featured').check();
        await page.locator('#article-form button[type=submit]').click();
        await page.locator('#busy-indicator').waitFor({ state: 'hidden' });
        const article = 'docs/blogs/postgres/测试新文章.md';
        assert.ok(mock.currentTree().has(article));
        assert.match(mock.text(article), /title: "测试新文章"/);
        assert.ok(JSON.parse(mock.text(catalogPath)).featured.includes('/blogs/postgres/测试新文章'));
        assert.equal(mock.requests.filter(r => r.method === 'PATCH').length, 1);
        const getArticle = () => JSON.parse(mock.text(catalogPath)).articles.find(a => a.path === '/blogs/postgres/测试新文章');
        assert.equal(getArticle().createdAt, '2026-11-26T01:20Z');
        assert.equal(getArticle().updatedAt, '2026-11-26T01:20Z');
        assert.equal(Object.hasOwn(getArticle(), 'author'), false);
        assert.match(await page.locator('#article-dates').textContent(), /2026-11-26 09:20/);
        await page.clock.setFixedTime(new Date('2026-11-26T01:23:51Z'));
        await page.locator('#article-author').fill('Guest');
        await page.locator('#article-description').fill('修改卡片摘要');
        await page.locator('#article-form button[type=submit]').click();
        await page.locator('#busy-indicator').waitFor({ state: 'hidden' });
        assert.equal(getArticle().author, 'Guest');
        assert.equal(getArticle().updatedAt, '2026-11-26T01:20Z');
        if (process.env.CMS_SCREENSHOT_DIR) await page.screenshot({ path: process.env.CMS_SCREENSHOT_DIR + '/article.png', fullPage: true });

        await page.locator('[data-view=media]').click();
        await page.locator('#media-grid .media-card').first().waitFor();
        async function paste(selector) {
            await page.evaluate(({ selector, base64 }) => {
                const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                const data = new DataTransfer();
                data.items.add(new File([bytes], 'clipboard.png', { type: 'image/png' }));
                document.querySelector(selector).dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
            }, { selector, base64: png.toString('base64') });
            await page.locator('#busy-indicator').waitFor({ state: 'hidden' });
        }
        const oldImages = new Set(mock.currentTree().keys());
        await paste('#dropzone');
        const image = [...mock.currentTree().keys()].find(p => !oldImages.has(p));
        assert.match(image, /^docs\/assets\/uploads\/.+\.png$/);
        assert.deepEqual(mock.blobs.get(mock.currentTree().get(image).sha), png);
        const markdown = '![' + path.basename(image) + '](https://raw.githubusercontent.com/Teletele-Lin/teletele-lin.github.io/main/' + image + ')';
        assert.equal(await page.locator('#uploaded-markdown').inputValue(), markdown);
        await page.locator('#copy-uploaded').click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), markdown);
        const card = page.locator('.media-card').filter({ hasText: path.basename(image) });
        await card.getByRole('button', { name: '复制 Markdown', exact: true }).click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), markdown);
        if (process.env.CMS_SCREENSHOT_DIR) await page.screenshot({ path: process.env.CMS_SCREENSHOT_DIR + '/media.png', fullPage: true });

        await page.locator('[data-view=articles]').click();
        await page.locator('#article-list button').filter({ hasText: '测试新文章' }).click();
        await page.locator('#article-form').waitFor({ state: 'visible' });
        await page.locator('#article-body').focus();
        await page.clock.setFixedTime(new Date('2026-11-26T01:24:27Z'));
        await page.locator('#article-body').evaluate(node => { node.setSelectionRange(node.value.length, node.value.length); });
        await paste('#article-body');
        const inserted = await page.locator('#article-body').inputValue();
        assert.match(inserted, /!\[.+\.png\]\(https:\/\/raw\.githubusercontent\.com\//);
        await page.locator('#article-form details summary').click();
        // Ensure details is open (the browser preserves its previous state).
        if (!(await page.locator('#article-form details').evaluate(d => d.open))) await page.locator('#article-form details summary').click();
        await page.locator('#pick-article-cover').click();
        await page.locator('#asset-dialog .asset-choice').first().click();
        assert.match(await page.locator('#article-cover-image').inputValue(), /^\/assets\/uploads\//);
        await page.locator('#article-form button[type=submit]').click();
        await page.locator('#busy-indicator').waitFor({ state: 'hidden' });
        assert.match(mock.text(article), /raw\.githubusercontent\.com/);
        assert.equal(getArticle().createdAt, '2026-11-26T01:20Z');
        assert.equal(getArticle().updatedAt, '2026-11-26T01:24Z');
        assert.equal(getArticle().author, 'Guest');

        await page.locator('[data-view=topics]').click();
        await page.locator('#new-topic').click();
        await page.locator('#topic-title').fill('新专题');
        await page.locator('#topic-id').fill('new-topic');
        await page.locator('#topic-description').fill('简介');
        await page.locator('#topic-form button[type=submit]').click();
        await page.locator('#busy-indicator').waitFor({ state: 'hidden' });
        assert.match(mock.text('docs/blogs/new-topic/overview.md'), /data-catalog="new-topic"/);
        assert.ok(JSON.parse(mock.text(catalogPath)).directories.some(d => d.id === 'new-topic'));

        await page.locator('[data-view=home]').click();
        await page.locator('#home-form').waitFor({ state: 'visible' });
        await page.locator('#home-body').fill((await page.locator('#home-body').inputValue()) + '\nCMS test\n');
        await page.locator('#home-form button[type=submit]').click();
        await page.locator('#busy-indicator').waitFor({ state: 'hidden' });
        assert.match(mock.text('docs/README.md'), /CMS test/);

        await page.locator('[data-view=articles]').click();
        await page.locator('#article-list button').filter({ hasText: '测试新文章' }).click();
        await page.locator('#article-form').waitFor({ state: 'visible' });
        await page.locator('#article-title').fill('未发布的新标题');
        mock.externalCommit(); const external = mock.head;
        await page.locator('#article-form button[type=submit]').click();
        await page.locator('#notice').filter({ hasText: '已有新提交' }).waitFor();
        assert.equal(mock.head, external);
        assert.equal(await page.locator('#article-title').inputValue(), '未发布的新标题');
        assert.deepEqual(errors, []);
        await context.close();
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
