(function (global) {
    'use strict';

    // CMS 编辑 JSON；这里校验目录关系，并还原前台使用的树结构。
    function build(data) {
        if (!data || !Array.isArray(data.directories) || !Array.isArray(data.articles) || !Array.isArray(data.featured)) {
            throw new Error('目录配置需要 directories、articles 和 featured 数组。');
        }
        var directories = new Map();
        var paths = new Set();
        var articlePaths = new Set();
        var sections = [];

        function normalize(item) {
            if (!item || typeof item.title !== 'string' || !item.title.trim() ||
                typeof item.path !== 'string' || !/^\/blogs\/[^?#]+$/.test(item.path) ||
                item.path.split('/').some(function (part) { return part === '..' || part === '.'; })) {
                throw new Error('每张卡片都需要标题和有效的文章路径。');
            }
            var node = Object.assign({}, item);
            node.path = node.path.replace(/\.md$/, '').replace(/\/$/, '');
            if (paths.has(node.path)) throw new Error('目录中有重复路径：' + node.path);
            paths.add(node.path);
            node.description = typeof node.description === 'string' ? node.description : '';
            node.tags = Array.isArray(node.tags) ? node.tags.filter(function (tag) { return typeof tag === 'string'; }) : [];
            node.coverImage = typeof node.coverImage === 'string' ? node.coverImage : '';
            node.order = Number.isFinite(node.order) ? node.order : 0;
            if (node.tone && !['teal', 'blue', 'violet'].includes(node.tone)) throw new Error('未知的卡片配色。');
            return node;
        }

        data.directories.forEach(function (item) {
            var node = normalize(item);
            if (typeof node.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(node.id) || node.id === 'root' || directories.has(node.id)) {
                throw new Error('目录标识必须唯一，且由小写字母、数字和短横线组成。');
            }
            node.children = [];
            directories.set(node.id, node);
        });
        directories.forEach(function (node) {
            var seen = new Set([node.id]);
            var parent = node.parent;
            while (parent) {
                if (seen.has(parent)) throw new Error('目录不能循环嵌套。');
                if (!directories.has(parent)) throw new Error('找不到上级目录：' + parent);
                seen.add(parent);
                parent = directories.get(parent).parent;
            }
        });
        directories.forEach(function (node) {
            if (node.parent) directories.get(node.parent).children.push(node);
            else sections.push(node);
        });
        directories.forEach(function (node) {
            // 后续导航会使用 parent 保存父节点对象。
            delete node.parent;
        });
        data.articles.forEach(function (item) {
            var node = normalize(item);
            if (!directories.has(item.directory)) throw new Error('找不到文章所属目录：' + item.directory);
            directories.get(item.directory).children.push(node);
            articlePaths.add(node.path);
        });
        function sort(nodes) {
            nodes.sort(function (a, b) { return a.order - b.order; });
            nodes.forEach(function (node) { if (node.children) sort(node.children); });
        }
        sort(sections);
        var featured = data.featured.map(function (path) {
            if (typeof path !== 'string') throw new Error('推荐阅读必须使用文章路径。');
            var normalized = path.replace(/\.md$/, '').replace(/\/$/, '');
            if (!articlePaths.has(normalized)) throw new Error('推荐阅读文章不存在：' + path);
            return normalized;
        });
        return { sections: sections, featured: featured };
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = { build: build };
        return;
    }
    var ready = fetch('assets/catalog.json', { cache: 'no-cache' }).then(function (response) {
        if (!response.ok) throw new Error('目录加载失败：' + response.status);
        return response.json();
    }).then(build);
    // 正文渲染钩子负责显示加载失败信息，避免慢速脚本加载时提前产生未处理的拒绝。
    ready.catch(function () {});
    global.TeleteleCatalog = { ready: ready };
}(typeof window === 'undefined' ? globalThis : window));
