const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../docs/assets/catalog.js');
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
