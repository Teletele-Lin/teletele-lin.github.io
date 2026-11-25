# Teletele's Blog

使用 Docsify 的 GitHub Pages 技术博客。网页内容位于 `docs/`，卡片目录配置位于 `docs/assets/catalog.json`。

## 本地预览

在仓库根目录运行：

```bash
python3 -m http.server 3000 --directory docs
```

打开 <http://localhost:3000/>。已安装 Docsify CLI 时，也可以运行 `docsify serve docs`。

## PostgreSQL 节点树可视化

「解析与计划可视化」文章链接到 `/tools/pg-node2graph/index.html`。工具来自 [PGNode2Graph-static 的 `36d572d` 版本](https://github.com/Teletele-Lin/PGNode2Graph-static/tree/36d572d81bfe35962489a1bc055aaf5e547a899f)，部署文件位于 `docs/tools/pg-node2graph/`，其中的 HTML 增加了返回教程的链接和博客图标。更新时可重新同步源项目的 `dist/`，并保留这两处集成。

## 自建内容管理后台（Teletele Studio）

博客顶部「内容管理」进入 [自建 CMS](https://teletele-lin.github.io/admin/index.html)。后台与博客一起部署在 GitHub Pages，不需要服务器、数据库、浏览器扩展或第三方 CMS。原先的 `.pages.yml` 保留供 Pages CMS 备用，但不再是主入口。

本地预览地址：<http://localhost:3000/admin/index.html>。

### 第一次连接

1. 打开 [GitHub Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new)，创建新 Token。
2. Repository access 选择 **Only select repositories**，只授权 `Teletele-Lin/teletele-lin.github.io`。
3. Repository permissions 中将 **Contents** 设置为 **Read and write**。不要额外授予 Workflows 等无关权限。
4. 在后台粘贴 Token，点击「连接仓库」。页面会使用 GitHub API 读取 main 分支的目录与正文。

Token 只保留在当前页面内存中，刷新或退出连接后需重新输入。不会保存至仓库、本地存储或发送给其他服务。后台的 Markdown 渲染库 [markdown-it 15.0.3](https://github.com/markdown-it/markdown-it) 为本地固定版本，预览禁用原始 HTML，避免文章中的 HTML 在持有 Token 的后台执行；HTML 原文在保存时保持不变，博客前台仍由 Docsify 渲染。

### 文章管理

- 从专题树选择文章，显示标题和实际文件名，也会列出未登记卡片的 Markdown。
- 新建文章时选择专题、填写标题、文件名、摘要及 Markdown 正文，可在「封面、标签与排序」中设置封面和首页推荐。
- 作者默认使用 `Teletele`，在文章编辑页可填写单篇覆盖作者；留空恢复全局默认。
- 支持实时分栏预览、源码和预览模式、粘贴截图直接上传并插入链接、从图片库选图。
- 「保存并发布」把 Markdown 正文、标题元数据和卡片配置 `docs/assets/catalog.json` 放在同一个 Git 提交中。删除文章时同步移除卡片与首页推荐。
- 已有文件路径保持稳定。修改所属专题会调整卡片展示关系而非移动文件；已有文章的改名、移动涉及外部链接，暂时在 Git 中手工操作。

### 文章创建与更新时间

文章生命周期统一保存在 `docs/assets/catalog.json`：`site.author` 为默认作者、`site.timezone` 为前台与后台展示时区（默认 `Asia/Shanghai`）；每篇文章的 `createdAt`、`updatedAt` 使用 UTC ISO 8601 分钟格式（例如 `2025-02-09T07:30Z`），显示为北京时间 `2025-02-09 15:30`。单篇文章可选 `author` 覆盖默认作者。

- 新建时首次保存自动记录创建、更新时间；后续只有标题或正文变化才推进更新时间，更新封面、摘要、作者、目录、标签和排序不会改变它。
- 现有文章已通过 Git 历史回填，创建时间为最早可追溯的提交时间，更新时间忽略历史纯移动/复制、图片迁移及初始 CMS 标题元数据迁移。并不表示文件在首次提交前的实际写作时间。
- 若不通过 CMS 而是在本地直接修改文章标题或正文，需同步更新 `catalog.json` 的 `updatedAt`。已有的 `createdAt` 保持不变。
- 若在 CMS 中首次登记已有但缺少时间记录的 Markdown，则从 GitHub 当前文件路径的提交历史补录；曾改名或移动的文件可能需要依据完整 Git 历史校正。

### 图片管理

- 在图片库按 Ctrl + V（macOS：⌘ + V），或者拖入图片、选择文件上传。
- 图片写入 `docs/assets/uploads/`，自动生成唯一文件名；支持 PNG、JPG、WebP、GIF、AVIF。
- 上传完成后直接显示新图片的 GitHub Markdown 链接，可一键复制全部；每张已有图片也有独立复制按钮，例如：

  ```markdown
  ![example.png](https://raw.githubusercontent.com/Teletele-Lin/teletele-lin.github.io/main/docs/assets/uploads/example.png)
  ```

- 「站内 Markdown」复制 `![example.png](/assets/uploads/example.png)`；卡片和专题可在编辑器内选择使用同一个图片库的封面。
- 删除图片前会检查博客 Markdown 及卡片配置中的引用；不能保证检测出站外引用。

### 专题与首页

- 专题可新建、编辑标题、简介、封面、颜色、顺序与上级专题；新建时自动生成对应的 `overview.md` 和目录卡片占位符。
- 已有专题路径和 ID 保持稳定；只允许删除没有文章、文件或子目录的专题。
- 首页与推荐模块可以编辑首页 Markdown，并调整推荐阅读顺序；保留首页的目录与推荐占位符。

### 保存和发布

后台使用 GitHub Git Data API 创建 blob、tree 和 commit，再以非强制方式更新 main 分支。保存前检查远程 HEAD，避免覆盖其他提交；如提示冲突，请先复制未保存的编辑内容，再同步远程仓库并重新编辑。提交成功后等待 GitHub Pages 部署，博客即可更新。CMS 不会更新本地 Git 工作区，在本地继续编辑前请先同步远端。

## 验证

```bash
node --test tests/catalog.test.cjs tests/admin.test.cjs
```

浏览器集成测试通过模拟 GitHub API 检查连接、文章增改、粘贴上传、复制 Markdown、专题与首页及冲突保护（不访问真实仓库）：

```bash
npm install --prefix /tmp/teletele-cms-test --no-save --no-package-lock playwright-core
NODE_PATH=/tmp/teletele-cms-test/node_modules \
CHROMIUM_EXECUTABLE=/path/to/chromium \
node --test tests/admin.browser.cjs
```

真实 GitHub 写入需仓库所有者创建 Token 后验证。
