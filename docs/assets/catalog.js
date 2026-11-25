(function (global) {
    'use strict';

    var defaultSite = { author: 'Teletele', timezone: 'Asia/Shanghai' };
    function isMinuteTimestamp(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(value)) return false;
        var date = new Date(value);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) + 'Z' === value;
    }
    function siteSettings(value) {
        var site = Object.assign({}, defaultSite, value || {});
        if (typeof site.author !== 'string' || !site.author.trim()) throw new Error('默认作者不能为空。');
        if (typeof site.timezone !== 'string' || !site.timezone) throw new Error('需要有效的时区。');
        try { new Intl.DateTimeFormat('en', { timeZone: site.timezone }); }
        catch (error) { throw new Error('未知的时区：' + site.timezone); }
        site.author = site.author.trim();
        return site;
    }
    function formatDateTime(value, timezone) {
        if (!isMinuteTimestamp(value)) return '';
        var parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone || defaultSite.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date(value));
        var fields = Object.fromEntries(parts.map(function (part) { return [part.type, part.value]; }));
        return fields.year + '-' + fields.month + '-' + fields.day + ' ' + fields.hour + ':' + fields.minute;
    }

    // CMS 编辑 JSON；这里校验目录关系，并还原前台使用的树结构。
    function build(data) {
        if (!data || !Array.isArray(data.directories) || !Array.isArray(data.articles) || !Array.isArray(data.featured)) {
            throw new Error('目录配置需要 directories、articles 和 featured 数组。');
        }
        var directories = new Map();
        var paths = new Set();
        var articlePaths = new Set();
        var sections = [];
        var site = siteSettings(data.site);

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
            ['createdAt', 'updatedAt'].forEach(function (key) {
                if (item[key] != null && !isMinuteTimestamp(item[key])) throw new Error('文章时间必须为 UTC 分钟格式：' + node.title + ' / ' + key);
            });
            if (item.createdAt && item.updatedAt && item.updatedAt < item.createdAt) throw new Error('更新时间不能早于创建时间：' + node.title);
            if (item.author != null && typeof item.author !== 'string') throw new Error('文章作者必须为文字：' + node.title);
            node.author = (item.author || '').trim() || site.author;
            node.updatedAt = item.updatedAt || item.createdAt || '';
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
        return { site: site, sections: sections, featured: featured };
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = { build: build, siteSettings: siteSettings, formatDateTime: formatDateTime, isMinuteTimestamp: isMinuteTimestamp };
        return;
    }
    // The administration UI validates the live GitHub catalog without fetching
    // the potentially older deployed copy from GitHub Pages.
    if (document.currentScript && document.currentScript.hasAttribute('data-validator-only')) {
        global.TeleteleCatalog = { build: build, siteSettings: siteSettings, formatDateTime: formatDateTime, isMinuteTimestamp: isMinuteTimestamp };
        return;
    }
    var ready = fetch('assets/catalog.json', { cache: 'no-cache' }).then(function (response) {
        if (!response.ok) throw new Error('目录加载失败：' + response.status);
        return response.json();
    }).then(build);
    // 正文渲染钩子负责显示加载失败信息，避免慢速脚本加载时提前产生未处理的拒绝。
    ready.catch(function () {});
    global.TeleteleCatalog = { ready: ready, build: build, siteSettings: siteSettings, formatDateTime: formatDateTime, isMinuteTimestamp: isMinuteTimestamp };
}(typeof window === 'undefined' ? globalThis : window));
