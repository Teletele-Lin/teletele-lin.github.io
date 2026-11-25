const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build, formatDateTime, isMinuteTimestamp } = require('../docs/assets/catalog.js');
const data = require('../docs/assets/catalog.json');
const clone = () => structuredClone(data);

function flatten(nodes) {
    return nodes.flatMap(node => [node, ...(node.children ? flatten(node.children) : [])]);
}

test('every existing article and directory remains reachable after the JSON migration', () => {
    const nodes = flatten(build(data).sections);
    const actual = new Set(nodes.map(node => node.path));
    function walk(directory) {
        return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
            const file = path.join(directory, entry.name);
            return entry.isDirectory() ? walk(file) : [file];
        });
    }
    const docs = path.resolve(__dirname, '../docs');
    const expected = new Set(walk(path.join(docs, 'blogs'))
        .filter(file => file.endsWith('.md'))
        .map(file => '/' + path.relative(docs, file).replaceAll(path.sep, '/').slice(0, -3)));
    assert.deepEqual(actual, expected);
    for (const item of data.featured) assert(nodes.some(node => node.path === item && !node.children));
});

test('sorting combines subdirectories and articles and keeps nested content under its parent', () => {
    const tree = build(data);
    const postgres = tree.sections.find(node => node.id === 'postgres');
    assert.deepEqual(postgres.children.map(node => node.title), ['开发与调试环境', '性能分析：火焰图', '解析与计划可视化', '查询处理']);
    assert.equal(postgres.children.at(-1).children.length, 3);
    assert.deepEqual(tree.sections.map(node => node.id), ['postgres', 'tools', 'ai']);
});

test('building a tree does not mutate data that the CMS edits', () => {
    const input = clone();
    build(input);
    assert.deepEqual(input, data);
});

test('directory cycles are rejected even when a parent appears after its child', () => {
    const input = clone();
    input.directories.find(node => node.id === 'postgres').parent = 'query';
    assert.throws(() => build(input), /循环/);
});

test('missing parent directories and orphan article cards are rejected', () => {
    const first = clone(); first.directories[0].parent = 'missing';
    assert.throws(() => build(first), /找不到上级目录/);
    const second = clone(); second.articles[0].directory = 'missing';
    assert.throws(() => build(second), /文章所属目录/);
});

test('duplicate directory IDs, paths and routes with an optional .md suffix are rejected', () => {
    const first = clone(); first.directories[1].id = first.directories[0].id;
    assert.throws(() => build(first), /唯一/);
    const second = clone(); second.articles[1].path = second.articles[0].path + '.md';
    assert.throws(() => build(second), /重复路径/);
});

test('featured items must refer to articles rather than directories or missing paths', () => {
    const first = clone(); first.featured[0] = first.directories[0].path;
    assert.throws(() => build(first), /推荐阅读文章不存在/);
    const second = clone(); second.featured[0] = '/blogs/missing';
    assert.throws(() => build(second), /推荐阅读文章不存在/);
});

test('invalid document shapes, directory IDs and traversal paths are rejected', () => {
    assert.throws(() => build({}), /数组/);
    const first = clone(); first.directories[0].id = 'root';
    assert.throws(() => build(first), /唯一/);
    const second = clone(); second.articles[0].path = '/blogs/../assets/file';
    assert.throws(() => build(second), /有效的文章路径/);
});

test('all articles have lifecycle times at minute precision and inherit the default author', () => {
    const tree = build(data);
    assert.equal(tree.site.author, 'Teletele');
    assert.equal(tree.site.timezone, 'Asia/Shanghai');
    for (const article of flatten(tree.sections).filter(node => !node.children)) {
        assert.ok(isMinuteTimestamp(article.createdAt), article.title);
        assert.ok(isMinuteTimestamp(article.updatedAt), article.title);
        assert.ok(article.updatedAt >= article.createdAt);
        assert.ok(article.author);
    }
    assert.equal(formatDateTime('2026-11-22T17:41Z', 'Asia/Shanghai'), '2026-11-23 01:41');
    assert.equal(formatDateTime('2025-02-09T07:30Z', 'UTC'), '2025-02-09 07:30');
    assert.equal(isMinuteTimestamp('2025-02-30T07:30Z'), false);
    assert.equal(isMinuteTimestamp('2025-02-09T07:30:55Z'), false);
});

test('catalog validates times, accepts older entries without dates, and supports an author override', () => {
    const input = clone();
    input.articles[0].author = 'Guest';
    assert.equal(flatten(build(input).sections).find(n => n.path === input.articles[0].path).author, 'Guest');
    input.articles[0].updatedAt = '2000-01-01T00:00Z';
    assert.throws(() => build(input), /更新时间不能早于/);
    input.articles[0].updatedAt = 'not a date';
    assert.throws(() => build(input), /UTC 分钟格式/);
    delete input.articles[0].createdAt; delete input.articles[0].updatedAt; delete input.site;
    assert.equal(build(input).site.author, 'Teletele');
    const invalidSite = clone(); invalidSite.site.timezone = 'Invalid/Zone';
    assert.throws(() => build(invalidSite), /未知的时区/);
});

test('blog renders author and minute timestamps on article header and update time on article cards', async () => {
    const vm = require('node:vm');
    const catalog = require('../docs/assets/catalog.js');
    const input = clone();
    input.articles[0].author = 'Guest <Writer>';
    const target = input.articles[0];
    const site = { ...catalog, ready: Promise.resolve(catalog.build(input)) };
    const context = vm.createContext({
        window: { TeleteleCatalog: site },
        document: { addEventListener() {}, querySelector() { return null; }, baseURI: 'https://teletele-lin.github.io/' },
        console, URL
    });
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../docs/assets/navigation.js'), 'utf8'), context);
    let before;
    const route = { path: target.path };
    context.window.TeleteleUI.install({
        init() {}, mounted() {}, doneEach() {}, beforeEach(callback) { before = callback; }
    }, { route });
    const result = await new Promise(resolve => before('# Test', resolve));
    assert.match(result, /class="article-author">Guest &lt;Writer&gt;/);
    assert.ok(result.includes('创建于 <time datetime="' + target.createdAt + '"'));
    assert.ok(result.includes('最近更新于 <time datetime="' + target.updatedAt + '"'));
    assert.ok(result.includes(formatDateTime(target.updatedAt, input.site.timezone)));
    route.path = input.directories.find(d => d.id === target.directory).path;
    const cards = await new Promise(resolve => before('<div data-catalog="' + target.directory + '"></div>', resolve));
    assert.match(cards, /class="card-date"/);
    assert.ok(cards.includes('更新于 <time datetime="' + target.updatedAt + '"'));
    assert.doesNotMatch(cards, /class="article-author"/);
});
