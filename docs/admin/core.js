(function (global) {
    'use strict';
    const OWNER = 'Teletele-Lin', REPO = 'teletele-lin.github.io', BRANCH = 'main';
    const API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
    const RAW = 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/';
    const CATALOG = 'docs/assets/catalog.json', UPLOADS = 'docs/assets/uploads/';
    const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
    const encodePath = path => path.split('/').map(segment => encodeURIComponent(segment).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
    const rawUrl = (path, ref = BRANCH) => RAW + encodeURIComponent(ref) + '/' + encodePath(path);
    const articleFile = route => 'docs' + route.replace(/\.md$/, '') + '.md';
    const articleRoute = file => file.slice(4).replace(/\.md$/, '');
    const directoryFolder = directory => articleFile(directory.path).replace(/\/[^/]+$/, '');
    const basename = path => path.split('/').at(-1);
    const isArticle = path => /^docs\/blogs\/.+\.md$/.test(path) && basename(path) !== 'overview.md';
    const isImage = path => path.startsWith(UPLOADS) && /\.(png|jpe?g|webp|gif|avif)$/i.test(path);
    const validPath = path => typeof path === 'string' && !path.startsWith('/') && !/[\\\u0000-\u001f]/.test(path) && path.split('/').every(p => p && p !== '.' && p !== '..');
    const editablePath = path => validPath(path) && (path === CATALOG || path === 'docs/README.md' || /^docs\/blogs\/.+\.md$/.test(path) || isImage(path));
    function filename(value) {
        const name = value.trim().replace(/\.md$/i, '');
        if (!name || /^\.{1,2}$/.test(name) || /[/\\?#%\u0000-\u001f]/.test(name) || name.toLowerCase() === 'overview') throw new Error('文件名不能为空，不能包含 / \\ ? # %，也不能是 overview。');
        return name + '.md';
    }
    function suggestedFilename(title) {
        return title.trim().replace(/[/\\?#%\u0000-\u001f]+/g, '-').replace(/^\.+|\.+$/g, '').trim() || 'note-' + new Date().toISOString().slice(0, 10);
    }
    function extractArticle(source) {
        const match = source.match(/^<!--\r?\n([\s\S]*?)\r?\n-->\r?\n(?:\r?\n)?/);
        if (!match || !/^title\s*:/m.test(match[1])) return { title: '', metadata: '', body: source };
        const line = match[1].match(/^title\s*:\s*(.*)$/m)[1].trim();
        let title = line;
        try { title = JSON.parse(line); } catch { title = line.replace(/^['"]|['"]$/g, ''); }
        return { title: typeof title === 'string' ? title : '', metadata: match[1], body: source.slice(match[0].length) };
    }
    function serializeArticle(title, body, metadata = '') {
        // Keep HTML comment delimiters out of the serialized YAML string.
        const line = 'title: ' + JSON.stringify(title).replace(/<!--/g, '\\u003c!--').replace(/-->/g, '--\\u003e');
        const header = metadata && /^title\s*:/m.test(metadata) ? metadata.replace(/^title\s*:.*$/m, () => line) : line;
        return '<!--\n' + header + '\n-->\n\n' + body;
    }
    function markdownImage(path, kind = 'raw') {
        const alt = basename(path).replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ');
        const url = kind === 'site' ? '/' + encodePath(path.slice(5)) : rawUrl(path);
        return '![' + alt + '](' + url + ')';
    }
    function imageName(file) {
        const ext = IMAGE_TYPES[file.type];
        if (!ext) throw new Error('不支持的图片格式：' + (file.name || file.type || '未知'));
        const stem = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
        return UPLOADS + stem + '-' + global.crypto.randomUUID().slice(0, 8) + '.' + ext;
    }
    function bytesToBase64(bytes) {
        // Small chunks avoid exceeding argument limits on screenshots.
        let binary = '';
        for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return btoa(binary);
    }
    function base64ToText(value) {
        return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
    }
    function catalogText(catalog) { return JSON.stringify(catalog, null, 2) + '\n'; }
    function upsertArticle(catalog, route, data, featured) {
        const next = structuredClone(catalog);
        const index = next.articles.findIndex(a => a.path === route);
        const entry = { ...(index >= 0 ? next.articles[index] : {}), ...data, path: route };
        if (index < 0) next.articles.push(entry); else next.articles[index] = entry;
        if (featured && !next.featured.includes(route)) next.featured.push(route);
        if (!featured) next.featured = next.featured.filter(p => p !== route);
        return next;
    }
    function removeArticle(catalog, route) {
        const next = structuredClone(catalog);
        next.articles = next.articles.filter(a => a.path !== route);
        next.featured = next.featured.filter(p => p !== route);
        return next;
    }

    class GitHub {
        #token;
        #fetch;
        snapshot = null;
        constructor(token, fetcher = global.fetch.bind(global)) { this.#token = token; this.#fetch = fetcher; }
        async request(path, method = 'GET', body) {
            if (!this.#token) throw new Error('请先连接 GitHub。');
            let response;
            try {
                response = await this.#fetch(API + path, {
                    method, headers: {
                        Accept: 'application/vnd.github+json',
                        Authorization: 'Bearer ' + this.#token,
                        'X-GitHub-Api-Version': '2022-11-28',
                        ...(body != null ? { 'Content-Type': 'application/json' } : {})
                    },
                    ...(body != null ? { body: JSON.stringify(body) } : {}),
                    credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer'
                });
            } catch { throw new Error('GitHub 连接失败，请检查网络后重试。'); }
            if (!response.ok) {
                let detail = '';
                try { detail = (await response.json()).message || ''; } catch {}
                const error = new Error('GitHub ' + response.status + '：' + (response.status === 401 ? 'Token 无效或已过期。' : response.status === 403 ? '权限不足或达到 API 限额。请检查 Token 的仓库及 Contents 权限。' : detail || '请求失败。'));
                error.status = response.status;
                throw error;
            }
            return response.json();
        }
        async head() { return (await this.request('/git/ref/heads/' + BRANCH)).object.sha; }
        async load() {
            const head = await this.head();
            const commit = await this.request('/git/commits/' + head);
            const tree = await this.request('/git/trees/' + commit.tree.sha + '?recursive=1');
            if (tree.truncated) throw new Error('仓库文件列表不完整，已停止加载，避免遗漏文件。');
            const files = new Map(tree.tree.filter(item => item.type === 'blob').map(item => [item.path, item]));
            this.snapshot = { head, tree: commit.tree.sha, files };
            return this.snapshot;
        }
        async readText(path) {
            const entry = this.snapshot?.files.get(path);
            if (!entry) throw new Error('找不到文件：' + path);
            const blob = await this.request('/git/blobs/' + entry.sha);
            if (blob.encoding !== 'base64') throw new Error('不支持的文件编码。');
            return base64ToText(blob.content);
        }
        async commit(changes, message) {
            const old = this.snapshot;
            if (!old) throw new Error('尚未加载仓库。');
            if (!changes.length) throw new Error('没有可提交的文件。');
            const seen = new Set();
            for (const change of changes) {
                if (!editablePath(change.path) || seen.has(change.path)) throw new Error('不允许的或重复的编辑路径：' + change.path);
                if (old.files.has(change.path) && old.files.get(change.path).mode !== '100644') throw new Error('不支持修改非普通文件：' + change.path);
                if (change.delete && !old.files.has(change.path)) throw new Error('文件已不存在：' + change.path);
                if (!change.delete && typeof change.text !== 'string' && !(change.bytes instanceof Uint8Array)) throw new Error('缺少文件内容。');
                seen.add(change.path);
            }
            if (await this.head() !== old.head) throw new Error('GitHub 上已有新提交。为避免覆盖其他改动，请复制未保存内容、刷新仓库后再编辑。');
            const entries = [];
            const files = new Map(old.files);
            for (const change of changes) {
                let sha = null;
                if (!change.delete) {
                    const binary = change.bytes instanceof Uint8Array;
                    const blob = await this.request('/git/blobs', 'POST', { content: binary ? bytesToBase64(change.bytes) : change.text, encoding: binary ? 'base64' : 'utf-8' });
                    sha = blob.sha;
                    files.set(change.path, { path: change.path, sha, mode: '100644', type: 'blob', size: binary ? change.bytes.length : new TextEncoder().encode(change.text).length });
                } else files.delete(change.path);
                entries.push({ path: change.path, mode: '100644', type: 'blob', sha });
            }
            const tree = await this.request('/git/trees', 'POST', { base_tree: old.tree, tree: entries });
            const commit = await this.request('/git/commits', 'POST', { message, tree: tree.sha, parents: [old.head] });
            // Never force the branch. A concurrent commit causes a non-fast-forward rejection.
            try {
                await this.request('/git/refs/heads/' + BRANCH, 'PATCH', { sha: commit.sha, force: false });
            } catch (error) {
                // The server may have accepted the update before the connection dropped.
                if (await this.head().catch(() => null) !== commit.sha) throw error;
            }
            this.snapshot = { head: commit.sha, tree: tree.sha, files };
            return commit.sha;
        }
        logout() { this.#token = ''; this.snapshot = null; }
    }
    const exported = { OWNER, REPO, BRANCH, CATALOG, UPLOADS, IMAGE_TYPES, GitHub, rawUrl, articleFile, articleRoute, directoryFolder, basename, isArticle, isImage, filename, suggestedFilename, extractArticle, serializeArticle, markdownImage, imageName, catalogText, upsertArticle, removeArticle, encodePath, editablePath };
    if (typeof module === 'object' && module.exports) module.exports = exported;
    else global.CMSCore = exported;
})(typeof window === 'undefined' ? globalThis : window);
