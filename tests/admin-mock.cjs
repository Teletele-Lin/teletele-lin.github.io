// In-memory implementation of the subset of GitHub Git Data endpoints used by the CMS.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = input => crypto.createHash('sha1').update(input).digest('hex');
const docs = path.resolve(__dirname, '../docs');
function fixture() {
    const entries = {};
    function walk(relative) {
        for (const d of fs.readdirSync(path.join(docs, relative), { withFileTypes: true })) {
            const name = path.join(relative, d.name);
            if (d.isDirectory()) walk(name);
            else entries['docs/' + name.replaceAll(path.sep, '/')] = fs.readFileSync(path.join(docs, name));
        }
    }
    walk('blogs'); walk('assets/uploads');
    for (const file of ['assets/catalog.json', 'README.md']) entries['docs/' + file] = fs.readFileSync(path.join(docs, file));
    return entries;
}
class MockGit {
    blobs = new Map(); trees = new Map(); commits = new Map(); requests = []; counter = 0; head;
    constructor(initial = fixture()) {
        const tree = new Map();
        for (const [path, data] of Object.entries(initial)) {
            const bytes = Buffer.from(data); const sha = hash(bytes); this.blobs.set(sha, bytes);
            tree.set(path, { path, sha, type: 'blob', mode: '100644', size: bytes.length });
        }
        const treeSha = this.storeTree(tree);
        this.head = this.storeCommit(treeSha, [], 'Initial');
    }
    storeTree(entries) { const sha = hash('tree' + this.counter++); this.trees.set(sha, entries); return sha; }
    storeCommit(tree, parents, message) {
        const sha = hash('commit' + this.counter++); this.commits.set(sha, { sha, tree: { sha: tree }, parents: parents.map(sha => ({sha})), message }); return sha;
    }
    currentTree() { return this.trees.get(this.commits.get(this.head).tree.sha); }
    text(path) { return this.blobs.get(this.currentTree().get(path).sha).toString('utf8'); }
    externalCommit() { this.head = this.storeCommit(this.commits.get(this.head).tree.sha, [this.head], 'External edit'); }
    handle(url, method = 'GET', body) {
        const full = new URL(url);
        const base = '/repos/Teletele-Lin/teletele-lin.github.io';
        const route = full.pathname.slice(base.length);
        this.requests.push({ method, route, body });
        if (!full.pathname.startsWith(base)) return [404, { message: 'not found' }];
        if (method === 'GET' && route === '/git/ref/heads/main') return [200, { object: { sha: this.head } }];
        if (method === 'GET' && route.startsWith('/git/commits/')) return [200, this.commits.get(route.split('/').at(-1))];
        if (method === 'GET' && route.startsWith('/git/trees/')) return [200, { tree: [...this.trees.get(route.split('/').at(-1)).values()], truncated: false }];
        if (method === 'GET' && route.startsWith('/git/blobs/')) {
            const bytes = this.blobs.get(route.split('/').at(-1)); return [200, { encoding: 'base64', content: bytes.toString('base64') }];
        }
        if (method === 'POST' && route === '/git/blobs') {
            const bytes = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8');
            const sha = hash(bytes); this.blobs.set(sha, bytes); return [201, { sha }];
        }
        if (method === 'POST' && route === '/git/trees') {
            const entries = new Map(this.trees.get(body.base_tree));
            for (const e of body.tree) {
                if (e.sha === null) entries.delete(e.path);
                else entries.set(e.path, { ...e, size: this.blobs.get(e.sha).length });
            }
            return [201, { sha: this.storeTree(entries) }];
        }
        if (method === 'POST' && route === '/git/commits') return [201, { sha: this.storeCommit(body.tree, body.parents, body.message) }];
        if (method === 'PATCH' && route === '/git/refs/heads/main') {
            if (body.force !== false || this.commits.get(body.sha).parents[0]?.sha !== this.head) return [422, { message: 'Reference update failed' }];
            this.head = body.sha; return [200, { object: { sha: this.head } }];
        }
        return [404, { message: 'unexpected endpoint ' + route }];
    }
    fetch = async (url, options) => {
        const [status, body] = this.handle(url, options.method, options.body && JSON.parse(options.body));
        return new Response(JSON.stringify(body), { status });
    };
}
module.exports = { MockGit, fixture };
