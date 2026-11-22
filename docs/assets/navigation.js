(function () {
    'use strict';

    var catalog = null;
    var byPath = new Map();
    var byId = new Map();
    var root = null;

    function canonical(path) {
        try { path = decodeURIComponent(path); } catch (error) { /* 保留原始路径。 */ }
        return path.replace(/\.md$/, '').replace(/\/$/, '') || '/';
    }

    function index(node, parent) {
        node.parent = parent;
        node.tone = node.tone || (parent && parent.tone) || 'teal';
        byPath.set(canonical(node.path), node);
        if (node.id) byId.set(node.id, node);
        if (node.children) node.children.forEach(function (child) { index(child, node); });
    }
    var catalogReady = window.TeleteleCatalog.ready.then(function (data) {
        catalog = data;
        root = { id: 'root', path: '/', title: '全部专题', children: catalog.sections };
        index(root, null);
        return catalog;
    });
    catalogReady.catch(function () {});

    function syncSearchIndex() {
        var navigation = document.querySelector('#search-index .sidebar-nav');
        if (!catalog || !navigation) return;
        // Docsify 的搜索插件通过此隐藏索引发现页面，不作为可见导航使用。
        navigation.innerHTML = Array.from(byPath.values()).map(function (node) {
            return '<a href="' + href(node) + '">' + escapeHTML(node.title) + '</a>';
        }).join('');
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }

    function href(node) { return escapeHTML('#' + node.path); }
    function articleCount(node) {
        return node.children ? node.children.reduce(function (count, child) { return count + articleCount(child); }, 0) : 1;
    }

    var folderIcon = '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M8 20a5 5 0 0 1 5-5h14l6 7h18a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V20Z" stroke="currentColor" stroke-width="2.5"/><path d="M8 30h48" stroke="currentColor" stroke-width="2.5"/></svg>';
    var articleIcon = '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M17 8h21l11 11v37H17V8Z" stroke="currentColor" stroke-width="2.5"/><path d="M37 8v13h12M25 32h16M25 40h16M25 48h10" stroke="currentColor" stroke-width="2.5"/></svg>';

    function imageURL(value) {
        if (!value) return '';
        try {
            var url = new URL(value, document.baseURI);
            return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
        } catch (error) { return ''; }
    }

    function card(node) {
        var isFolder = Boolean(node.children);
        var image = imageURL(node.coverImage);
        var meta = isFolder ? articleCount(node) + ' 篇文章' : (node.tags || []).slice(0, 2).join(' · ');
        return '<a class="library-card" data-kind="' + (isFolder ? 'folder' : 'article') + '" href="' + href(node) + '">' +
            '<span class="card-cover tone-' + node.tone + (image ? ' has-image' : '') + '">' +
            (image ? '<img class="cover-image" src="' + escapeHTML(image) + '" alt="" loading="lazy" decoding="async" data-no-zoom><span class="cover-shade" aria-hidden="true"></span>' : '') +
            '<span class="cover-top"><span>' + escapeHTML(node.label || '文章') + '</span><span class="cover-badge">' + (isFolder ? '目录' : escapeHTML(node.status || '文章')) + '</span></span>' +
            '<span class="cover-title">' + escapeHTML(node.cover || node.title) + '</span>' +
            '<span class="cover-symbol">' + (isFolder ? folderIcon : articleIcon) + '</span>' +
            '</span><span class="card-body"><span class="card-title">' + escapeHTML(node.title) + '</span>' +
            '<span class="card-description">' + escapeHTML(node.description) + '</span>' +
            '<span class="card-meta"><span>' + escapeHTML(meta) + '</span><span class="card-action">' + (isFolder ? '进入目录' : '阅读全文') + '</span></span></span></a>';
    }

    function collection(id) {
        var node = byId.get(id);
        if (!node) return '';
        var folders = node.children.filter(function (child) { return child.children; }).length;
        var count = id === 'root' ? node.children.length + ' 个专题 · ' + articleCount(node) + ' 篇文章' :
            node.children.length + ' 项内容' + (folders ? ' · ' + folders + ' 个目录' : ' · 文章列表');
        return '<section class="catalog-block" aria-label="' + escapeHTML(node.title) + '">' +
            '<div class="collection-toolbar"><p class="collection-count">' + count + '</p>' +
            (id === 'root' ? '' : '<label class="collection-filter"><span>筛选</span><input type="search" data-card-filter placeholder="标题、标签或关键词" aria-label="筛选当前目录"></label>') +
            '</div><div class="card-grid">' + node.children.map(card).join('') + '</div>' +
            '<p class="filter-empty" role="status" hidden>没有匹配的内容，试试其他关键词，或清空筛选。</p></section>';
    }

    function breadcrumbs(node) {
        var chain = [];
        for (var current = node; current; current = current.parent) chain.unshift(current);
        return '<nav class="breadcrumbs" aria-label="当前位置">' + chain.map(function (item, i) {
            return i === chain.length - 1 ? '<span aria-current="page">' + escapeHTML(item.title) + '</span>' :
                '<a href="' + href(item) + '">' + escapeHTML(item.title) + '</a><span class="breadcrumb-divider" aria-hidden="true">/</span>';
        }).join('') + '</nav>\n\n';
    }

    function moveSearch() {
        var search = document.querySelector('div.search');
        var mount = document.getElementById('search-mount');
        if (!catalog || !search || !mount) return;
        if (!mount.contains(search)) mount.appendChild(search);
        search.querySelector('input').setAttribute('aria-label', '搜索全部文章');
        var results = search.querySelector('.results-panel');
        if (!results.dataset.titlesReady) {
            results.dataset.titlesReady = 'true';
            new MutationObserver(function () {
                results.querySelectorAll('.matching-post a').forEach(function (link) {
                    var path = link.getAttribute('href').replace(/^#/, '').split('?')[0];
                    var node = byPath.get(canonical(path));
                    var heading = link.querySelector('h2');
                    if (node && heading && heading.textContent.indexOf('blogs/') === 0) {
                        heading.textContent = node.title;
                    }
                });
            }).observe(results, { childList: true });
        }
        document.getElementById('search-open').disabled = false;
    }

    function outline(article, vm) {
        var headings = Array.from(article.querySelectorAll('h1[id], h2[id], h3[id]'));
        if (headings.length < 2 || article.querySelector('.article-outline')) return;
        var details = document.createElement('details');
        details.className = 'article-outline';
        details.innerHTML = '<summary>本文目录</summary><nav aria-label="本文目录">' + headings.map(function (heading) {
            return '<a class="outline-level-' + heading.tagName.slice(1) + '" href="' + escapeHTML('#' + vm.route.path + '?id=' + encodeURIComponent(heading.id)) + '">' + escapeHTML(heading.textContent) + '</a>';
        }).join('') + '</nav>';
        article.querySelector('.article-toolbar').after(details);
    }

    function install(hook, vm) {
        hook.init(function () {
            // 正文渲染和搜索索引共用 Marked，跳过 Pages CMS 的标题注释。
            window.marked.use({
                tokenizer: {
                    html: function (source) {
                        var metadata = /^<!--\r?\ntitle:[\s\S]*?\r?\n-->(?:\r?\n|$)/.exec(source);
                        if (!metadata) return false;
                        return { type: 'space', raw: metadata[0] };
                    }
                }
            });
        });
        hook.mounted(function () { syncSearchIndex(); moveSearch(); });
        hook.beforeEach(function (content, next) {
            catalogReady.then(function () {
                syncSearchIndex();
                next(render(content));
            }).catch(function (error) {
                console.error('目录配置加载失败', error);
                next('<div class="catalog-error" role="alert"><h1>目录暂时无法加载</h1><p>请检查网络后重新加载页面。</p><button type="button" data-retry-catalog>重新加载</button></div>');
            });
        });
        function render(content) {
            var node = byPath.get(canonical(vm.route.path));
            content = content.replace(/<div data-catalog="([a-z][a-z0-9-]*)"><\/div>/g, function (_, id) { return collection(id); });
            content = content.replace('<div data-featured></div>', '<div class="card-grid featured-grid">' + catalog.featured.map(function (path) { return card(byPath.get(path)); }).join('') + '</div>');
            if (!node || node === root) return content;
            var prefix = breadcrumbs(node);
            if (!node.children) {
                prefix += '<div class="article-toolbar"><span>' + escapeHTML(node.title) + '</span><a href="' + href(node.parent) + '">返回所属目录</a></div>\n\n';
                content += '\n\n<footer class="article-footer"><a href="' + href(node.parent) + '">返回「' + escapeHTML(node.parent.title) + '」</a><a href="#/">浏览全部专题</a></footer>';
            }
            return prefix + content;
        }
        hook.doneEach(function () {
            if (!catalog) return;
            moveSearch();
            document.querySelectorAll('.cover-image').forEach(function (image) {
                function fallback() {
                    image.parentElement.classList.remove('has-image');
                    image.hidden = true;
                }
                image.addEventListener('error', fallback, { once: true });
                if (image.complete && image.naturalWidth === 0) fallback();
            });
            var node = byPath.get(canonical(vm.route.path));
            var isArticle = Boolean(node && !node.children);
            document.body.classList.toggle('page-article', isArticle);
            document.body.classList.toggle('page-library', !isArticle);
            document.title = node && node !== root ? node.title + " · Teletele's Blog" : "Teletele's Blog";
            var article = document.getElementById('main');
            if (article) {
                article.tabIndex = -1;
                if (isArticle) outline(article, vm);
            }
            var section = node;
            while (section && section.parent && section.parent !== root) section = section.parent;
            document.querySelectorAll('[data-section]').forEach(function (link) {
                if (section && link.dataset.section === section.id) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var dialog = document.getElementById('search-dialog');
        function openSearch() {
            if (document.getElementById('search-open').disabled || dialog.open) return;
            dialog.showModal();
            dialog.querySelector('input').focus();
        }
        document.getElementById('search-open').addEventListener('click', openSearch);
        document.getElementById('search-close').addEventListener('click', function () { dialog.close(); });
        dialog.addEventListener('click', function (event) {
            if (event.target.closest('.matching-post a')) dialog.close();
            if (event.target === dialog) {
                var bounds = dialog.getBoundingClientRect();
                if (event.clientX < bounds.left || event.clientX > bounds.right ||
                    event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
            }
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && dialog.open) {
                event.preventDefault();
                dialog.close();
                return;
            }
            var target = event.target;
            if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
                !target.closest('input, textarea, select, [contenteditable="true"]')) {
                event.preventDefault();
                openSearch();
            }
        });
        document.addEventListener('input', function (event) {
            if (!event.target.matches('[data-card-filter]')) return;
            var query = event.target.value.trim().toLocaleLowerCase();
            var block = event.target.closest('.catalog-block');
            var count = 0;
            block.querySelectorAll('.library-card').forEach(function (item) {
                item.hidden = !item.textContent.toLocaleLowerCase().includes(query);
                if (!item.hidden) count++;
            });
            block.querySelector('.filter-empty').hidden = count > 0;
        });
        document.addEventListener('click', function (event) {
            if (event.target.closest('[data-retry-catalog]')) location.reload();
        });
        document.querySelector('.skip-link').addEventListener('click', function (event) {
            var article = document.getElementById('main');
            if (article) {
                event.preventDefault();
                event.stopPropagation();
                article.focus();
            }
        });
    });

    window.TeleteleUI = {
        install: install
    };
}());
