(() => {
    'use strict';
    const C = window.CMSCore;
    const $ = id => document.getElementById(id);
    const state = { client: null, catalog: null, view: 'articles', article: null, topic: null, featured: [], dirty: false, busy: false, picker: null, filenameEdited: false, previews: new Map() };
    const editors = new Map();
    const md = window.markdownit({ html: false, linkify: true, breaks: false });
    const base = 'https://github.com/' + C.OWNER + '/' + C.REPO;
    const val = id => $(id).value.trim();
    const set = (id, value) => { $(id).value = value ?? ''; };
    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    };
    const button = (text, action, className = 'button secondary small') => {
        const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b;
    };
    const files = () => state.client?.snapshot?.files || new Map();
    const imageFiles = () => [...files().keys()].filter(C.isImage).sort((a, b) => {
        const stamp = path => /^\d{17}-/.test(C.basename(path)) ? C.basename(path).slice(0, 17) : '';
        return stamp(b).localeCompare(stamp(a)) || b.localeCompare(a);
    });
    const sorted = items => [...items].sort((a, b) => (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title, 'zh'));
    const clone = value => structuredClone(value);
    let noticeTimer;
    function notify(message, kind = 'success') {
        const notice = $('notice'); notice.textContent = message; notice.className = 'notice ' + kind; notice.hidden = false;
        clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, kind === 'error' ? 10000 : 4500);
    }
    function dirty(value = true) {
        state.dirty = value;
        document.title = (value ? '● ' : '') + '内容管理 · Teletele Studio';
    }
    const mayLeave = () => !state.dirty || window.confirm('有尚未保存的编辑内容，确定放弃吗？');
    window.addEventListener('beforeunload', event => { if (state.dirty || state.busy) { event.preventDefault(); event.returnValue = ''; } });
    async function run(label, action, onError = error => notify(error.message, 'error')) {
        if (state.busy) return false;
        state.busy = true; $('busy-text').textContent = label; $('busy-indicator').hidden = false;
        $('workspace').inert = true; $('connect').disabled = true; $('logout').disabled = true;
        try { await action(); return true; }
        catch (error) { onError(error); return false; }
        finally { state.busy = false; $('workspace').inert = false; $('connect').disabled = false; $('logout').disabled = false; $('busy-indicator').hidden = true; }
    }
    function setTheme(theme) {
        document.documentElement.dataset.theme = theme;
        $('theme-toggle').textContent = theme === 'dark' ? '浅色模式' : '深色模式';
        try { localStorage.setItem('teletele-theme', theme); } catch {}
    }
    let theme;
    try { theme = localStorage.getItem('teletele-theme'); } catch {}
    document.documentElement.dataset.theme = theme === 'dark' || theme === 'light' ? theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    $('theme-toggle').textContent = document.documentElement.dataset.theme === 'dark' ? '浅色模式' : '深色模式';
    $('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

    async function loadData(client) {
        const previous = client.snapshot;
        try {
            await client.load();
            const catalog = JSON.parse(await client.readText(C.CATALOG));
            window.TeleteleCatalog.build(catalog);
            return catalog;
        } catch (error) { client.snapshot = previous; throw error; }
    }
    function updateStats() {
        $('article-count').textContent = [...files().keys()].filter(C.isArticle).length;
        $('media-count').textContent = imageFiles().length;
        $('head-link').textContent = '提交 ' + state.client.snapshot.head.slice(0, 7) + ' ↗';
        $('head-link').href = base + '/commit/' + state.client.snapshot.head;
    }
    function getEditor(type) {
        if (!editors.has(type)) {
            editors.set(type, new window.StudioEditor($(type + '-body'), {
                busy: () => state.busy,
                onChange: () => dirty(),
                previewHTML: value => md.render(value),
                renderPreview: (value, pane) => renderMarkdown(type, value, pane),
                onUpload: (images, editor, range) => void uploadImages(images, { editor, range }),
                onPick: (editor, range) => openPicker(path => {
                    editor.insertAt(C.markdownImage(path), range);
                    editor.focus();
                })
            }));
        }
        return editors.get(type);
    }
    function bodyValue(type) { return getEditor(type).value; }
    for (const button of document.querySelectorAll('[data-open-editor]')) {
        button.addEventListener('click', () => getEditor(button.dataset.openEditor).setFullscreen(true, true));
    }
    function clearArticle() {
        state.article = null; $('article-form').hidden = true; $('article-empty').hidden = false;
        $('article-form').reset(); editors.get('article')?.reset();
    }
    function clearTopic() {
        state.topic = null; $('topic-form').hidden = true; $('topic-empty').hidden = false; $('topic-form').reset(); editors.get('topic')?.reset();
    }
    function resetViews() {
        clearArticle(); clearTopic(); $('home-form').reset(); editors.get('home')?.reset(); $('featured-list').replaceChildren(); state.featured = [];
        dirty(false);
    }
    function clearImagePreviews() {
        for (const url of state.previews.values()) URL.revokeObjectURL(url);
        state.previews.clear(); $('upload-result').hidden = true; $('uploaded-markdown').value = '';
    }
    function showView(view) {
        for (const editor of editors.values()) editor.setFullscreen(false);
        state.view = view;
        for (const name of ['articles', 'media', 'topics', 'home']) $(name + '-view').hidden = name !== view;
        for (const b of $('nav').querySelectorAll('button[data-view]')) b.classList.toggle('active', b.dataset.view === view);
        if (view === 'articles') renderArticles();
        if (view === 'topics') renderTopics();
        if (view === 'media') renderMedia();
        const type = { articles: 'article', topics: 'topic', home: 'home' }[view];
        if (type) editors.get(type)?.refresh();
    }
    $('login-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (state.busy) return;
        const token = val('token'); if (!token) return;
        const client = new C.GitHub(token);
        $('token').value = ''; $('login-error').textContent = '';
        const ok = await run('正在读取 GitHub 仓库…', async () => {
            const catalog = await loadData(client);
            state.client = client; state.catalog = catalog;
            resetViews(); $('login-view').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
            updateStats(); showView('articles'); notify('GitHub 仓库已连接。');
        }, error => { $('login-error').textContent = error.message; client.logout(); });
        if (!ok) $('token').focus();
    });
    $('logout').addEventListener('click', () => {
        if (state.busy || !mayLeave()) return;
        state.client.logout(); state.client = null; state.catalog = null; resetViews(); clearImagePreviews();
        $('workspace').hidden = true; $('login-view').hidden = false; $('logout').hidden = true;
        $('article-list').replaceChildren(); $('topic-list').replaceChildren(); $('media-grid').replaceChildren(); $('asset-grid').replaceChildren();
        $('token').focus(); notify('已退出连接。');
    });
    $('refresh').addEventListener('click', () => {
        if (!mayLeave()) return;
        void run('同步远程仓库…', async () => {
            state.catalog = await loadData(state.client); resetViews(); clearImagePreviews(); updateStats();
            if (state.view === 'home') await fillHome();
            showView(state.view); notify('已同步最新提交。');
        });
    });
    $('nav').addEventListener('click', event => {
        const item = event.target.closest('[data-view]'); if (!item || item.dataset.view === state.view || !mayLeave()) return;
        const view = item.dataset.view;
        if (view === 'home') {
            void run('加载首页…', async () => { await fillHome(); clearArticle(); clearTopic(); dirty(false); showView(view); });
        } else { resetViews(); showView(view); }
    });

    function topicOptions(select, selected, includeRoot = false, exclude = '') {
        select.replaceChildren();
        const dirs = state.catalog.directories;
        if (includeRoot) select.append(new Option('根目录 / 首页', ''));
        function visit(parent, prefix) {
            for (const d of sorted(dirs.filter(d => (d.parent || '') === parent))) {
                if (d.id === exclude) continue;
                select.append(new Option(prefix + d.title, d.id)); visit(d.id, prefix + '　');
            }
        }
        visit('', '');
        if (selected != null) select.value = selected;
    }
    function directoryFor(file) {
        return [...state.catalog.directories].sort((a, b) => C.directoryFolder(b).length - C.directoryFolder(a).length)
            .find(d => file.startsWith(C.directoryFolder(d) + '/'))?.id || '';
    }
    function allArticles() {
        const result = state.catalog.articles.map(item => ({ ...item, file: C.articleFile(item.path), registered: true }));
        const known = new Set(result.map(item => item.file));
        for (const path of files().keys()) if (C.isArticle(path) && !known.has(path)) result.push({ title: C.basename(path).replace(/\.md$/, ''), path: C.articleRoute(path), file: path, directory: directoryFor(path), registered: false, description: '' });
        return result;
    }
    function renderArticles() {
        const query = val('article-search').toLocaleLowerCase();
        const items = allArticles().filter(a => (a.title + ' ' + a.file).toLocaleLowerCase().includes(query));
        const list = $('article-list'); list.replaceChildren();
        const articleButton = a => {
            const b = button(a.title, () => openArticle(a), 'tree-item' + (state.article?.file === a.file ? ' active' : ''));
            b.append(el('small', '', C.basename(a.file) + (!a.registered ? ' · 未登记' : !files().has(a.file) ? ' · 文件缺失' : '')));
            b.title = a.file; return b;
        };
        function branch(d) {
            const children = sorted(state.catalog.directories.filter(n => n.parent === d.id)).map(branch).filter(Boolean);
            const articles = sorted(items.filter(a => a.directory === d.id));
            if (query && !children.length && !articles.length) return null;
            const details = el('details'); details.open = true;
            details.append(el('summary', '', d.title + '  (' + articles.length + ')'));
            const content = el('div', 'tree-nested'); content.append(...articles.map(articleButton), ...children); details.append(content);
            return details;
        }
        list.append(...sorted(state.catalog.directories.filter(d => !d.parent)).map(branch).filter(Boolean));
        const unknown = items.filter(a => !state.catalog.directories.some(d => d.id === a.directory));
        if (unknown.length) { const group = el('details'); group.open = true; group.append(el('summary', '', '其他文章'), ...unknown.map(articleButton)); list.append(group); }
        if (!items.length) list.append(el('p', 'no-results', '没有匹配的文章。'));
    }
    $('article-search').addEventListener('input', renderArticles);
    function fillArticle(item, source = '', preserveEditor = false) {
        const article = C.extractArticle(source);
        state.article = { file: item.file || null, metadata: article.metadata, registered: item.registered || false };
        const site = window.TeleteleCatalog.siteSettings(state.catalog.site);
        const formatTime = value => window.TeleteleCatalog.formatDateTime(value, site.timezone);
        $('article-empty').hidden = true; $('article-form').hidden = false;
        $('article-mode').textContent = item.file ? 'EDIT ARTICLE' : 'NEW ARTICLE';
        $('article-heading').textContent = item.file ? '编辑文章' : '新建文章';
        $('delete-article').hidden = !item.file;
        set('article-title', item.title || article.title || '');
        if (!item.registered && article.title) set('article-title', article.title);
        topicOptions($('article-directory'), item.directory || state.catalog.directories[0]?.id || '');
        set('article-filename', item.file ? C.basename(item.file) : '');
        $('article-filename').readOnly = !!item.file; state.filenameEdited = !!item.file;
        for (const [key, value] of Object.entries({
            description: item.description, label: item.label, cover: item.cover, 'cover-image': item.coverImage,
            tags: (item.tags || []).join(', '), order: item.order ?? 10, status: item.status, author: item.author
        })) set('article-' + key, value);
        $('article-author').placeholder = site.author;
        $('article-dates').textContent = item.createdAt
            ? '创建于 ' + formatTime(item.createdAt) + ' · 更新于 ' + formatTime(item.updatedAt || item.createdAt)
            : item.file ? '保存时自动补录历史时间' : '首次保存时自动记录时间';
        $('article-dates').title = site.timezone;
        $('article-featured').checked = state.catalog.featured.includes(item.path);
        if (!preserveEditor) $('article-metadata').open = !item.file || !item.registered;
        updateArticlePath();
        const editor = getEditor('article'); editor.setTitle(val('article-title') || '新建文章'); editor.setValue(article.body, preserveEditor);
        dirty(false); renderArticles();
    }
    function openArticle(item) {
        if (state.article?.file === item.file && !$('article-form').hidden) return;
        if (!mayLeave()) return;
        void run('读取文章…', async () => {
            const source = files().has(item.file) ? await state.client.readText(item.file) : '';
            fillArticle(item, source);
        });
    }
    $('new-article').addEventListener('click', () => {
        if (!mayLeave()) return;
        if (!state.catalog.directories.length) { notify('请先创建一个专题。', 'error'); return; }
        const directory = state.catalog.directories[0].id;
        const order = Math.max(0, ...state.catalog.articles.filter(a => a.directory === directory).map(a => a.order || 0)) + 10;
        fillArticle({ directory, order }); $('article-title').focus();
    });
    function articleTarget() {
        if (state.article?.file) return state.article.file;
        const directory = state.catalog.directories.find(d => d.id === val('article-directory'));
        if (!directory) throw new Error('请选择所属专题。');
        return C.directoryFolder(directory) + '/' + C.filename(val('article-filename'));
    }
    function updateArticlePath() {
        try { $('article-path').textContent = articleTarget(); }
        catch { $('article-path').textContent = '填写标题和文件名后生成保存路径'; }
    }
    $('article-title').addEventListener('input', () => {
        if (!state.filenameEdited && !state.article?.file) set('article-filename', C.suggestedFilename(val('article-title')));
        editors.get('article')?.setTitle(val('article-title') || '新建文章');
        updateArticlePath();
    });
    $('article-filename').addEventListener('input', () => { state.filenameEdited = true; updateArticlePath(); });
    $('article-directory').addEventListener('change', updateArticlePath);
    $('article-form').addEventListener('input', () => dirty());
    $('article-form').addEventListener('change', () => dirty());
    $('article-form').addEventListener('invalid', event => {
        if ($('article-metadata').contains(event.target)) $('article-metadata').open = true;
    }, true);
    $('toggle-article-list').addEventListener('click', () => {
        const collapsed = $('article-layout').classList.toggle('list-collapsed');
        $('toggle-article-list').textContent = collapsed ? '展开目录' : '折叠目录';
        $('toggle-article-list').setAttribute('aria-pressed', String(collapsed));
        editors.get('article')?.refresh();
    });
    function renderMarkdown(type, value, preview) {
        // HTML is intentionally disabled; uploaded Markdown cannot run scripts or
        // present interactive HTML in a page that holds a GitHub token.
        const top = preview.scrollTop;
        preview.innerHTML = md.render(value);
        let dir;
        try {
            const target = type === 'article' ? articleTarget() : type === 'topic' ? topicTarget() : 'docs/README.md';
            dir = target.replace(/\/[^/]+$/, '/');
        } catch { dir = 'docs/'; }
        for (const image of preview.querySelectorAll('img')) {
            const source = image.getAttribute('src');
            if (source) {
                const local = [...state.previews].find(([path]) => source === C.rawUrl(path) || source === '/' + C.encodePath(path.slice(5)));
                if (local) { image.src = local[1]; continue; }
            }
            if (!source || /^(https?:|data:|blob:|\/\/)/i.test(source)) continue;
            try {
                const repoPath = source.startsWith('/') ? 'docs' + decodeURI(source) : decodeURI(new URL(source, 'https://example.invalid/' + C.encodePath(dir)).pathname.slice(1));
                if (repoPath.startsWith('docs/')) image.src = C.rawUrl(repoPath, state.client?.snapshot.head || C.BRANCH);
            } catch {}
        }
        preview.scrollTop = top;
    }
    function validCover(value) {
        if (value && !/^\/(?!\/)|^https?:\/\//i.test(value)) throw new Error('封面图片请使用站内根路径或 https:// 图片链接。');
        return value;
    }
    function number(id) { const value = Number(val(id)); if (!Number.isFinite(value)) throw new Error('显示顺序必须为数字。'); return value; }
    async function publish(changes, nextCatalog, message) {
        if (nextCatalog) {
            window.TeleteleCatalog.build(nextCatalog);
            const serialized = C.catalogText(nextCatalog);
            if (serialized !== C.catalogText(state.catalog)) changes.push({ path: C.CATALOG, text: serialized });
        }
        if (!changes.length) { notify('没有需要保存的改动。'); return false; }
        const sha = await state.client.commit(changes, '[Main]  ' + message);
        if (nextCatalog) state.catalog = nextCatalog;
        updateStats(); notify('已提交 ' + sha.slice(0, 7) + ' · 等待 GitHub Pages 自动发布。');
        return true;
    }
    $('article-form').addEventListener('submit', event => {
        event.preventDefault();
        void run('正在保存文章与卡片…', async () => {
            const path = articleTarget(); const route = C.articleRoute(path);
            if (!state.article.file && (files().has(path) || state.catalog.articles.some(a => a.path === route))) throw new Error('文件名已存在，请修改文件名。');
            const title = val('article-title'); if (!title) throw new Error('请填写标题。');
            const previous = state.catalog.articles.find(item => item.path === route);
            const oldSource = files().has(path) ? await state.client.readText(path) : null;
            const old = oldSource === null ? null : C.extractArticle(oldSource);
            if (old) old.title = previous?.title || old.title || C.basename(path).replace(/\.md$/, '');
            const newBody = bodyValue('article');
            const historical = old && (!previous?.createdAt || !previous?.updatedAt) ? await state.client.historyTimes(path) : {};
            const card = {
                title, directory: val('article-directory'), description: val('article-description'),
                label: val('article-label'), cover: val('article-cover'), coverImage: validCover(val('article-cover-image')),
                tags: val('article-tags').split(/[,，]/).map(x => x.trim()).filter(Boolean),
                order: number('article-order'), status: val('article-status'), author: val('article-author'),
                ...C.articleLifecycle(previous, old, title, newBody, historical)
            };
            const next = C.upsertArticle(state.catalog, route, card, $('article-featured').checked);
            const body = C.serializeArticle(title, newBody, state.article.metadata);
            const changes = [];
            if (oldSource !== body) changes.push({ path, text: body });
            await publish(changes, next, (state.article.file ? 'Update ' : 'Create ') + path);
            fillArticle({ ...card, path: route, file: path, registered: true }, body, true);
        });
    });
    $('delete-article').addEventListener('click', () => {
        const path = state.article?.file;
        if (!path || !window.confirm('确定删除文章及关联卡片？此操作会提交到 GitHub。\n' + path)) return;
        void run('删除文章…', async () => {
            const next = C.removeArticle(state.catalog, C.articleRoute(path));
            await publish(files().has(path) ? [{ path, delete: true }] : [], next, 'Delete ' + path);
            clearArticle(); dirty(false); renderArticles();
        });
    });

    function renderTopics() {
        const list = $('topic-list'); list.replaceChildren();
        function branch(d) {
            const wrap = el('div');
            const b = button(d.title, () => openTopic(d), 'tree-item' + (state.topic?.id === d.id ? ' active' : ''));
            b.append(el('small', '', d.id)); wrap.append(b);
            const children = sorted(state.catalog.directories.filter(n => n.parent === d.id));
            if (children.length) { const nested = el('div', 'tree-nested'); nested.append(...children.map(branch)); wrap.append(nested); }
            return wrap;
        }
        list.append(...sorted(state.catalog.directories.filter(d => !d.parent)).map(branch));
    }
    function fillTopic(item, source = '', preserveEditor = false) {
        state.topic = { id: item.id || null, path: item.path || null };
        $('topic-empty').hidden = true; $('topic-form').hidden = false;
        $('topic-heading').textContent = item.id ? '编辑专题' : '新建专题'; $('delete-topic').hidden = !item.id;
        $('topic-id').readOnly = !!item.id;
        for (const [key, value] of Object.entries({ title: item.title, id: item.id, order: item.order ?? 10, description: item.description, label: item.label, cover: item.cover, 'cover-image': item.coverImage, tone: item.tone })) set('topic-' + key, value);
        topicOptions($('topic-parent'), item.parent || '', true, item.id || '');
        const editor = getEditor('topic'); editor.setTitle(val('topic-title') || '新建专题'); editor.setValue(source, preserveEditor);
        updateTopicPath(); dirty(false); renderTopics();
    }
    function topicTarget() {
        if (state.topic?.path) return C.articleFile(state.topic.path);
        const id = val('topic-id');
        if (!/^[a-z][a-z0-9-]*$/.test(id) || id === 'root') throw new Error('请填写有效专题标识。');
        const parent = state.catalog.directories.find(d => d.id === val('topic-parent'));
        return (parent ? C.directoryFolder(parent) : 'docs/blogs') + '/' + id + '/overview.md';
    }
    function updateTopicPath() {
        try { $('topic-path').textContent = topicTarget(); } catch { $('topic-path').textContent = '填写专题标识后自动生成目录'; }
    }
    function openTopic(item) {
        if (state.topic?.id === item.id || !mayLeave()) return;
        void run('读取专题…', async () => {
            const path = C.articleFile(item.path);
            fillTopic(item, files().has(path) ? await state.client.readText(path) : '');
        });
    }
    $('new-topic').addEventListener('click', () => {
        if (!mayLeave()) return;
        fillTopic({ parent: '', order: Math.max(0, ...state.catalog.directories.filter(d => !d.parent).map(d => d.order || 0)) + 10 });
        $('topic-title').focus();
    });
    $('topic-id').addEventListener('input', updateTopicPath);
    $('topic-title').addEventListener('input', () => editors.get('topic')?.setTitle(val('topic-title') || '新建专题'));
    $('topic-parent').addEventListener('change', updateTopicPath);
    $('topic-form').addEventListener('input', () => dirty());
    $('topic-form').addEventListener('change', () => dirty());
    $('topic-form').addEventListener('submit', event => {
        event.preventDefault();
        void run('保存专题与概览…', async () => {
            const id = val('topic-id'), path = topicTarget(), title = val('topic-title');
            const route = C.articleRoute(path), next = clone(state.catalog);
            const index = next.directories.findIndex(d => d.id === state.topic.id);
            if (index < 0 && (next.directories.some(d => d.id === id) || files().has(path))) throw new Error('专题标识或目录已存在。');
            const item = { ...(index >= 0 ? next.directories[index] : {}), id, title, path: route, parent: val('topic-parent'), description: val('topic-description'), label: val('topic-label'), cover: val('topic-cover'), coverImage: validCover(val('topic-cover-image')), tone: val('topic-tone'), order: number('topic-order') };
            if (index < 0) next.directories.push(item); else next.directories[index] = item;
            let body = bodyValue('topic') || '# ' + title + '\n\n' + item.description + '\n';
            if (!new RegExp('data-catalog=["\']' + id + '["\']').test(body)) body = body.trimEnd() + '\n\n<div data-catalog="' + id + '"></div>\n';
            const changes = [];
            if (!files().has(path) || await state.client.readText(path) !== body) changes.push({ path, text: body });
            await publish(changes, next, (index < 0 ? 'Create topic ' : 'Update topic ') + id);
            fillTopic(item, body, true);
        });
    });
    $('delete-topic').addEventListener('click', () => {
        const topic = state.catalog.directories.find(d => d.id === state.topic?.id);
        if (!topic) return;
        if (state.catalog.directories.some(d => d.parent === topic.id) || state.catalog.articles.some(a => a.directory === topic.id) ||
            [...files().keys()].some(p => p.startsWith(C.directoryFolder(topic) + '/') && p !== C.articleFile(topic.path))) {
            notify('此专题仍有文章或子目录，不能删除。', 'error'); return;
        }
        if (!window.confirm('确定删除空专题及概览？\n' + topic.title)) return;
        void run('删除专题…', async () => {
            const next = clone(state.catalog); next.directories = next.directories.filter(d => d.id !== topic.id);
            const path = C.articleFile(topic.path);
            await publish(files().has(path) ? [{ path, delete: true }] : [], next, 'Delete topic ' + topic.id);
            clearTopic(); dirty(false); renderTopics();
        });
    });

    async function fillHome() {
        const editor = getEditor('home'); editor.setTitle('首页内容'); editor.setValue(await state.client.readText('docs/README.md'));
        state.featured = [...state.catalog.featured]; renderFeatured();
    }
    function renderFeatured() {
        const list = $('featured-list'); list.replaceChildren();
        state.featured.forEach((route, index) => {
            const row = el('div', 'featured-row');
            row.append(el('span', '', state.catalog.articles.find(a => a.path === route)?.title || route));
            const up = button('↑', () => moveFeatured(index, -1)); up.disabled = index === 0;
            const down = button('↓', () => moveFeatured(index, 1)); down.disabled = index === state.featured.length - 1;
            row.append(up, down, button('移除', () => { state.featured.splice(index, 1); renderFeatured(); dirty(); })); list.append(row);
        });
        if (!state.featured.length) list.append(el('p', 'muted', '暂无推荐文章。'));
    }
    function moveFeatured(index, direction) {
        [state.featured[index], state.featured[index + direction]] = [state.featured[index + direction], state.featured[index]];
        renderFeatured(); dirty();
    }
    $('home-form').addEventListener('submit', event => {
        event.preventDefault();
        void run('保存首页…', async () => {
            const next = clone(state.catalog); next.featured = [...state.featured];
            const body = bodyValue('home'), changes = [];
            if (!/data-catalog=["']root["']/.test(body) || !/data-featured(?:[\s=>])/.test(body)) throw new Error('请保留首页的 data-catalog="root" 与 data-featured 占位符。');
            if (body !== await state.client.readText('docs/README.md')) changes.push({ path: 'docs/README.md', text: body });
            await publish(changes, next, 'Update homepage'); dirty(false);
        });
    });

    async function copy(text) {
        try { await navigator.clipboard.writeText(text); notify('已复制到剪贴板。'); }
        catch { window.prompt('复制以下内容', text); }
    }
    function thumb(path) {
        const image = el('img', 'media-thumb'); image.src = state.previews.get(path) || C.rawUrl(path, state.client.snapshot.head);
        image.addEventListener('error', () => { image.src = '/' + C.encodePath(path.slice(5)); }, { once: true });
        image.alt = C.basename(path); image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; return image;
    }
    function renderMedia() {
        const query = val('media-search').toLocaleLowerCase();
        const all = imageFiles(); $('media-total').textContent = all.length;
        const grid = $('media-grid'); grid.replaceChildren();
        const filtered = all.filter(path => path.toLocaleLowerCase().includes(query));
        for (const path of filtered) {
            const card = el('article', 'panel media-card');
            const preview = el('a'); preview.href = C.rawUrl(path); preview.target = '_blank'; preview.rel = 'noopener noreferrer'; preview.append(thumb(path));
            const body = el('div', 'media-card-body');
            const name = el('div', 'media-name', C.basename(path)); name.title = path;
            const size = files().get(path).size;
            body.append(name, el('span', 'muted small-text', typeof size === 'number' ? (size / 1024).toFixed(1) + ' KB' : '图片'));
            body.append(button('复制 Markdown', () => copy(C.markdownImage(path)), 'button primary small full-copy'));
            const actions = el('div', 'actions'); actions.append(button('站内 Markdown', () => copy(C.markdownImage(path, 'site'))), button('删除', () => deleteImage(path), 'button danger small'));
            body.append(actions); card.append(preview, body); grid.append(card);
        }
        if (!filtered.length) grid.append(el('p', 'no-results', '没有匹配的图片。'));
    }
    $('media-search').addEventListener('input', renderMedia);
    $('copy-uploaded').addEventListener('click', () => copy($('uploaded-markdown').value));
    $('media-choose').addEventListener('click', () => $('media-files').click());
    $('media-files').addEventListener('change', event => {
        const selected = [...event.target.files]; event.target.value = ''; void uploadImages(selected);
    });
    function clipboardFiles(event) {
        const data = event.clipboardData;
        const files = [...(data?.files || [])];
        if (!files.length) for (const item of data?.items || []) if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f); }
        return files.filter(file => file.type.startsWith('image/'));
    }
    async function uploadImages(input, target = null) {
        if (!input.length) return;
        await run('正在上传图片到 GitHub…', async () => {
            const changes = [];
            for (const file of input) {
                const path = C.imageName(file);
                if (file.size > 100 * 1024 * 1024) throw new Error('图片超过 GitHub 文件上限（100 MB）。');
                changes.push({ path, bytes: new Uint8Array(await file.arrayBuffer()) });
            }
            await publish(changes, null, 'Upload ' + changes.length + ' image(s)');
            for (let i = 0; i < changes.length; i++) state.previews.set(changes[i].path, URL.createObjectURL(input[i]));
            if (target) {
                target.editor.insertAt(changes.map(change => C.markdownImage(change.path)).join('\n'), target.range);
                dirty();
            } else {
                // The media library includes a copy button on each newly uploaded card.
                $('uploaded-markdown').value = changes.map(change => C.markdownImage(change.path)).join('\n');
                $('upload-result').hidden = false;
                $('media-search').value = ''; renderMedia();
            }
        });
        if (target) target.editor.focus();
    }
    document.addEventListener('paste', event => {
        if (!state.client || state.busy || event.defaultPrevented || $('asset-dialog').open) return;
        const images = clipboardFiles(event); if (!images.length) return;
        if (state.view === 'media' && !(event.target instanceof Element && event.target.closest('input,textarea,[contenteditable=true]'))) {
            event.preventDefault(); void uploadImages(images);
        }
    });
    $('paste-image').addEventListener('click', async () => {
        try {
            if (!navigator.clipboard.read) throw new Error('unsupported');
            const images = [];
            for (const item of await navigator.clipboard.read()) {
                const type = item.types.find(t => C.IMAGE_TYPES[t]);
                if (type) images.push(new File([await item.getType(type)], 'clipboard.' + C.IMAGE_TYPES[type], { type }));
            }
            if (!images.length) { notify('剪贴板中没有图片，请先截图。', 'error'); return; }
            await uploadImages(images);
        } catch { notify('浏览器未授权读取剪贴板；请直接在图片库按 Ctrl + V / ⌘ + V。', 'error'); }
    });
    const zone = $('dropzone');
    zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('dragover'); void uploadImages([...event.dataTransfer.files]); });
    async function deleteImage(path) {
        if (!window.confirm('确定删除图片？将先检查 Markdown 与封面引用。\n' + C.basename(path))) return;
        void run('检查图片引用并删除…', async () => {
            const name = C.basename(path), encoded = encodeURIComponent(name);
            const used = text => text.includes(name) || text.includes(encoded) || text.includes(C.encodePath(name));
            if (used(C.catalogText(state.catalog))) throw new Error('此图片正在卡片或专题封面中使用，无法删除。');
            for (const file of files().keys()) {
                if (file === 'docs/README.md' || /^docs\/blogs\/.+\.md$/.test(file)) {
                    if (used(await state.client.readText(file))) throw new Error('此图片可能被引用：' + file);
                }
            }
            await publish([{ path, delete: true }], null, 'Delete ' + path);
            if (state.previews.has(path)) { URL.revokeObjectURL(state.previews.get(path)); state.previews.delete(path); }
            if ($('uploaded-markdown').value.includes(C.rawUrl(path))) { $('upload-result').hidden = true; $('uploaded-markdown').value = ''; }
            renderMedia();
        });
    }
    function openPicker(action) {
        state.picker = action; $('asset-search').value = ''; renderPicker(); $('asset-dialog').showModal(); $('asset-search').focus();
    }
    function renderPicker() {
        const query = val('asset-search').toLocaleLowerCase(), grid = $('asset-grid'); grid.replaceChildren();
        for (const path of imageFiles().filter(p => p.toLocaleLowerCase().includes(query))) {
            const choice = button('', () => { const action = state.picker; $('asset-dialog').close(); state.picker = null; action?.(path); }, 'asset-choice');
            choice.append(thumb(path), el('span', '', C.basename(path))); grid.append(choice);
        }
        if (!grid.children.length) grid.append(el('p', 'no-results', '没有可选图片。请先在图片库上传。'));
    }
    $('asset-search').addEventListener('input', renderPicker);
    $('close-asset-dialog').addEventListener('click', () => $('asset-dialog').close());
    $('asset-dialog').addEventListener('close', () => { state.picker = null; });
    for (const type of ['article', 'topic']) $('pick-' + type + '-cover').addEventListener('click', () => openPicker(path => { set(type + '-cover-image', '/' + C.encodePath(path.slice(5))); dirty(); }));
})();
