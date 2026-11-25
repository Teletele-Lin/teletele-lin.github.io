const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../docs/admin/core.js');
const { MockGit } = require('./admin-mock.cjs');
const { build } = require('../docs/assets/catalog.js');

test('article metadata preserves Markdown and supports titles with special characters', () => {
    const body = '# 中文\n\n```sql\nSELECT 1;\n```\n';
    const title = '查询 "优化器" --> 详解';
    const source = C.serializeArticle(title, body, 'title: "Old"\nextra: 2');
    assert.equal(source.split('-->').length, 2);
    assert.equal(C.extractArticle(source).title, title);
    assert.equal(C.extractArticle(source).body, body);
    assert.match(C.extractArticle(source).metadata, /extra: 2/);
    assert.deepEqual(C.extractArticle(body), { title: '', metadata: '', body });
});

test('image Markdown uses encoded GitHub URL and site path; safe filenames', () => {
    const path = 'docs/assets/uploads/截图 (1) [a].png';
    assert.equal(C.markdownImage(path), '![截图 (1) \\[a\\].png](https://raw.githubusercontent.com/Teletele-Lin/teletele-lin.github.io/main/docs/assets/uploads/%E6%88%AA%E5%9B%BE%20%281%29%20%5Ba%5D.png)');
    assert.match(C.markdownImage(path, 'site'), /\(\/assets\/uploads\//);
    assert.throws(() => C.filename('../bad'), /文件名/);
    assert.throws(() => C.filename('overview.md'), /overview/);
    assert.equal(C.filename('中文笔记.md'), '中文笔记.md');
    assert.equal(C.editablePath('docs/blogs/../admin/index.html'), false);
    assert.equal(C.editablePath('docs/admin/admin.js'), false);
});

test('CMS creates dates to the minute and only advances updatedAt for a changed title or body', () => {
    const old = { title: '标题', body: '# 正文\n' };
    const dates = C.articleLifecycle(null, null, old.title, old.body, {}, '2026-11-26T12:34:59+08:00');
    assert.deepEqual(dates, { createdAt: '2026-11-26T04:34Z', updatedAt: '2026-11-26T04:34Z' });
    const later = '2026-11-27T13:26:22+08:00';
    assert.deepEqual(C.articleLifecycle(dates, old, old.title, old.body, {}, later), dates);
    assert.deepEqual(C.articleLifecycle(dates, { ...old, body: '# 正文\r\n' }, old.title, old.body, {}, later), dates);
    const updated = { createdAt: dates.createdAt, updatedAt: '2026-11-27T05:26Z' };
    assert.deepEqual(C.articleLifecycle(dates, old, '新标题', old.body, {}, later), updated);
    assert.deepEqual(C.articleLifecycle(dates, old, old.title, '修改', {}, later), updated);
    assert.deepEqual(C.articleLifecycle(updated, old, old.title, '修改', {}, '2026-01-01T00:00Z'), updated);
    assert.deepEqual(C.articleLifecycle(null, old, old.title, old.body, dates, later), dates);
});

test('blank author removes the override, leaving the global default', () => {
    const catalog = require('../docs/assets/catalog.json');
    const route = catalog.articles[0].path;
    const withAuthor = C.upsertArticle(catalog, route, { author: 'Guest' }, false);
    const reset = C.upsertArticle(withAuthor, route, { author: '' }, false);
    assert.equal(withAuthor.articles[0].author, 'Guest');
    assert.equal(Object.hasOwn(reset.articles[0], 'author'), false);
});

test('CMS can recover existing uncatalogued file times from its GitHub history', async () => {
    const path = 'docs/blogs/postgres/旧笔记.md';
    const client = new C.GitHub('mock-token', async (url, options) => {
        assert.equal(options.method, 'GET');
        const query = new URL(url).searchParams;
        assert.equal(query.get('path'), path);
        assert.equal(query.get('sha'), 'snapshot');
        return new Response(JSON.stringify([
            { sha: 'd49aec4e04f35cab0826282dbc2eec79d2f38f45', commit: { author: { date: '2026-11-22T17:47:42Z' } } },
            { sha: 'update', commit: { author: { date: '2025-12-01T02:03:24Z' } } },
            { sha: 'create', commit: { author: { date: '2025-01-01T00:00:52Z' } } }
        ]), { status: 200 });
    });
    client.snapshot = { head: 'snapshot' };
    assert.deepEqual(await client.historyTimes(path), { createdAt: '2025-01-01T00:00Z', updatedAt: '2025-12-01T02:03Z' });
});

test('article, catalog and featured are updated atomically in one commit', async () => {
    const mock = new MockGit();
    const client = new C.GitHub('mock-token', mock.fetch);
    const initial = await client.load();
    const catalog = JSON.parse(await client.readText(C.CATALOG));
    const route = '/blogs/postgres/新的文章';
    const updated = C.upsertArticle(catalog, route, { title: '新文章', directory: 'postgres', description: '摘要', order: 90 }, true);
    assert.ok(build(updated).featured.includes(route));
    const file = C.articleFile(route);
    const sha = await client.commit([{ path: file, text: C.serializeArticle('新文章', '# 内容\n') }, { path: C.CATALOG, text: C.catalogText(updated) }], 'Create article');
    assert.equal(mock.head, sha);
    assert.equal(mock.commits.get(sha).parents[0].sha, initial.head);
    assert.equal(mock.text(file), '<!--\ntitle: "新文章"\n-->\n\n# 内容\n');
    assert.ok(JSON.parse(mock.text(C.CATALOG)).articles.some(a => a.path === route));
    assert.equal(mock.requests.filter(r => r.method === 'PATCH').length, 1);
    assert.equal(mock.requests.find(r => r.method === 'PATCH').body.force, false);
    const removed = C.removeArticle(updated, route);
    await client.commit([{ path: file, delete: true }, { path: C.CATALOG, text: C.catalogText(removed) }], 'Delete');
    assert.equal(mock.currentTree().has(file), false);
    assert.equal(JSON.parse(mock.text(C.CATALOG)).featured.includes(route), false);
});

test('binary upload preserves bytes and current snapshot', async () => {
    const mock = new MockGit({});
    const client = new C.GitHub('mock-token', mock.fetch);
    await client.load();
    const path = C.UPLOADS + 'image.png';
    const bytes = Uint8Array.from([137, 80, 78, 71, 0, 255]);
    await client.commit([{ path, bytes }], 'Upload');
    assert.deepEqual(mock.blobs.get(mock.currentTree().get(path).sha), Buffer.from(bytes));
    assert.equal(client.snapshot.files.get(path).size, bytes.length);
    client.logout();
    await assert.rejects(client.head(), /连接 GitHub/);
});

test('concurrent remote commits are not overwritten and paths outside CMS cannot be changed', async () => {
    const mock = new MockGit({});
    const client = new C.GitHub('mock-token', mock.fetch);
    await client.load();
    await assert.rejects(client.commit([{ path: 'docs/admin/admin.js', text: 'invalid' }], 'Invalid'), /不允许/);
    mock.externalCommit(); const remote = mock.head;
    await assert.rejects(client.commit([{ path: 'docs/blogs/test.md', text: 'new' }], 'Stale'), /已有新提交/);
    assert.equal(mock.head, remote);
    assert.equal(mock.requests.filter(r => r.method === 'PATCH').length, 0);
});

test('branch fast-forward protection rejects a conflict during commit itself', async () => {
    const mock = new MockGit({});
    const client = new C.GitHub('mock-token', async (url, options) => {
        if (options.method === 'PATCH') mock.externalCommit();
        return mock.fetch(url, options);
    });
    await client.load();
    await assert.rejects(client.commit([{ path: 'docs/blogs/test.md', text: 'new' }], 'Conflict'), /422/);
    assert.equal(mock.currentTree().has('docs/blogs/test.md'), false);
});
