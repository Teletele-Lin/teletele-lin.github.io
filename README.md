# Teletele's Blog

使用 Docsify 的 GitHub Pages 技术博客。网页内容位于 `docs/`，卡片目录配置位于 `docs/assets/catalog.json`。

## 本地预览

在仓库根目录运行：

```bash
python3 -m http.server 3000 --directory docs
```

打开 <http://localhost:3000/>。已安装 Docsify CLI 时，也可以运行 `docsify serve docs`。

## 开通 Pages CMS

1. 将本次改动提交并推送到博客仓库的 `main` 分支。CMS 读取远程仓库中的 `.pages.yml`，不会读取本地未推送的文件。
2. 打开 <https://app.pagescms.org/Teletele-Lin/teletele-lin.github.io/main>，使用 GitHub 登录。
3. 按提示安装 Pages CMS 的 GitHub App，只需授权 `Teletele-Lin/teletele-lin.github.io` 仓库。
4. 选择 `main` 分支，确认出现“文章正文”“卡片与封面”“首页内容”“专题概览”和“图片库”。

博客顶部的“内容管理”也会打开使用入口，本地地址为 <http://localhost:3000/admin/index.html>。首次登录、GitHub App 授权和真实上传需要仓库所有者在 Pages CMS 中完成；仓库配置不包含 Token 或客户端密钥。

官方文档：[快速开始](https://pagescms.org/docs/quick-start/)、[媒体库](https://pagescms.org/docs/configuration/media/)。

## 上传图片与选择封面

- 在“图片库”上传图片，或者在正文、卡片的图片选择器里上传。
- 图片保存到 `docs/assets/uploads/`，公开路径为 `/assets/uploads/文件名`。上传文件自动使用随机名称，降低重名覆盖的概率。
- 支持 JPG、JPEG、PNG、WebP、GIF、AVIF。
- 在“卡片与封面”的专题或文章条目中，设置“封面图片”。留空或图片加载失败时，前台使用文字封面。
- 正文插图使用 Markdown，例如 `![说明](/assets/uploads/文件名.webp)`。
- 已将 4 篇文章中的 10 张旧图床图片复制到图片库，并将正文引用改为 `/assets/uploads/`；原图床文件保留。其他外部图片链接仍可继续使用。

图片可能被多篇正文或多个封面引用，删除前应检查引用。

## 编辑与新增文章

“文章正文”对应 `docs/blogs/`，支持子目录。配置使用 `format: raw` 和单独的 `body` 字段，保留纯 Markdown，不新增 frontmatter。

现有文章可直接编辑正文并插入图片。编辑器支持可视化和 Source 模式；包含代码块、复杂表格或自定义 HTML 时，优先使用 Source 模式。

新增文章分两步：

1. 在“文章正文”中新建 Markdown，选择目录并填写文件名，然后保存正文。
2. 在“卡片与封面 → 文章卡片”新增条目，填写标题、摘要、所属目录标识和页面路径，再按需选择封面。

例如文件 `docs/blogs/postgres/新笔记.md` 的页面路径是 `/blogs/postgres/新笔记`，所属目录是 `postgres`。目前目录标识：

| 标识 | 目录 |
| --- | --- |
| `postgres` | PostgreSQL 内核 |
| `query` | PostgreSQL 内核 / 查询处理 |
| `tools` | 工具与环境 |
| `ai` | AI 与思考 |

“首页推荐阅读”填写已登记的文章页面路径。文章正文与卡片配置独立保存，正文新增后不会自动生成卡片。已有文章改名或移动时，需要同步修改卡片路径、推荐阅读和文章内链接。

## 新增专题或子目录

在“卡片与封面 → 专题与子目录”新增条目，填写唯一的目录标识、标题、摘要和页面路径；“上级目录标识”留空代表首页专题，填写其他目录标识则成为其子目录。显示顺序按数字从小到大排列。

对应的目录 Markdown 需要包含卡片占位符，例如：

```html
<div data-catalog="new-topic"></div>
```

`new-topic` 必须与新目录标识一致。新目录概览文件可在本地创建，或者通过“文章正文”新建 `overview.md`；保存后它会从普通文章列表中隐藏。如需以后从 CMS 编辑该概览，在 `.pages.yml` 的“专题概览”分组里增加对应文件入口。

根目录新增的专题会自动出现在首页卡片中；顶部是固定的快捷专题入口，需要时在 `docs/index.html` 中调整。

## 验证

```bash
node --test tests/catalog.test.cjs
```

目录加载器会校验重复路径、目录标识、父子关系及推荐阅读路径。CMS 配置使用官方字段类型，但实际上传与 GitHub 写入仍依赖 Pages CMS 登录和授权。

保存到 GitHub 后，等待 GitHub Pages 部署完成，再刷新博客查看。CMS 保存不会直接更新本地工作区，继续在本地编辑前应同步远程变更。
