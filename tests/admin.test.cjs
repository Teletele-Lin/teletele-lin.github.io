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
