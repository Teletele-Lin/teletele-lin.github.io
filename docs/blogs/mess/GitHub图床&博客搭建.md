## 前言

> 此篇wiki介绍如何使用Github搭建图床和个人博客，提供一个免费的知识库搭建一站式解决方案

## 搭建图床并配置Markdown编辑器

> 使用Typora作为Markdown编辑器，搭建GitHub图床

### 下载并配置Typora

下载Typora最后一个免费的版本v0.11.18

https://github.com/wyf9661/typora-free/releases/tag/v0.11.18

### 修改注册表

这个版本安装后无法直接运行，会提示版本过低，需要修改一下注册表

```shell
计算机\HKEY_CURRENT_USER\SOFTWARE\Typora
```

右键->权限，设置当前用户权限为完全拒绝，之后就能正常打开

### 配置Picgo

配置picgo以便能够通过picgo将图片上传至GitHub，需要创建一个Github仓库，并拿到此仓库的Token，普通仓库即可，无特别配置，不作介绍

+ 网络图片也上传到图床
+ 选择使用PicGo-Core
+ 点击下载或更新，自动下载PicGo插件

![image-20250209145431220](https://raw.githubusercontent.com/Teletele-Lin/cos/main/picgo/image-20250209145431220.png)

+ 编辑配置文件

```json
{
    "picBed": {
      "current": "github",
      "uploader": "github",
      "smms": {
        "token": ""
      },
      "github": {
        "repo": "Teletele-Lin/cos", // 配置仓库
        "branch": "main",   // 配置分支
        "token": "xxxxxxxxxxxxxxxx", // 配置Token
        "path": "picgo/",  // 配置上传目录
        "customUrl": ""
      },
      "proxy": "http://127.0.0.1:7890" //配置代理
    },
    "settings": {
      "shortKey": {
        "picgo:upload": {
          "enable": true,
          "key": "CommandOrControl+Shift+P",
          "name": "upload",
          "label": "QUICK_UPLOAD"
        }
      },
      "showUpdateTip": false,
      "privacyEnsure": true,
      "proxy": "",
      "registry": "",
      "server": {
        "port": 36677,
        "host": "127.0.0.1",
        "enable": true
      }
    },
    "needReload": false,
    "picgoPlugins": {},
    "debug": true,
    "PICGO_ENV": "GUI"
  }
```

+ 验证是否能够正常上传图片到远程仓库

## 通过GitHub搭建网站

本文中使用Docsify + GitHub搭建一个网站。Wiki的编写、预览、发布最好搭建一个开发环境，使用虚拟机或者远程机即可，如果只是尝试使用，直接将此仓库中所有的文件拷贝到你的GitHub仓库就行。

### 创建github仓库

> 创建一个GitHub仓库，名称为 [你的用户名].github.io，仓库配置上，Pages设置为main分支，/docs目录

### 安装npm和node.js

```shell
sudo apt install nodejs npm
nodejs -v
npm -v
```

### 修改npm源（可选）

```shell
npm config get registry
npm config set registry https://registry.npmmirror.com
```

### 安装docsify

```shell
sudo npm i docsify-cli -g
```

### 克隆远程仓库

```shell
git clone git@github.com:Teletele-Lin/teletele-lin.github.io.git
```

### 初始化docsify

```shell
docsify init ./docs
```

### 启动服务以便能够通过网页预览博客

```shell
docsify serve docs
```



## 自定义与编写博客

以下文件均在docs目录下，官方文档：https://docsify.js.org/#/?id=docsify

### 编辑index.html

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <title>Teletele-Blog</title>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
    <meta name="description" content="Description">
    <meta name="viewport"
        content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">
    <!-- 设置浏览器图标 -->
    <link rel="icon" href="https://github.com/fluidicon.png" type="image/x-icon" />
    <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
    <!-- 默认主题 -->
    <link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify/lib/themes/vue.css">
</head>

<body>
    <!-- 定义加载时候的动作 -->
    <div id="app">加载中...</div>
    <script>
        window.$docsify = {
            // 项目名称
            name: 'Telete Blog',
            // 仓库地址，点击右上角的Github章鱼猫头像会跳转到此地址
            repo: 'https://github.com/Teletele-Lin',
            // 侧边栏支持，默认加载的是项目根目录下的_sidebar.md文件
            loadSidebar: true,
            // 导航栏支持，默认加载的是项目根目录下的_navbar.md文件
            loadNavbar: true,
            // 封面支持，默认加载的是项目根目录下的_coverpage.md文件
            coverpage: false,
            // 最大支持渲染的标题层级
            maxLevel: 5,
            // 自定义侧边栏后默认不会再生成目录，设置生成目录的最大层级（建议配置为2-4）
            subMaxLevel: 1,
            // 小屏设备下合并导航栏到侧边栏
            mergeNavbar: true,
            /*搜索相关设置*/
            search: {
                maxAge: 86400000,// 过期时间，单位毫秒，默认一天
                paths: 'auto',// 注意：仅适用于 paths: 'auto' 模式
                placeholder: '搜索',              
                // 支持本地化
                placeholder: {
                    '/zh-cn/': '搜索',
                    '/': 'Type to search'
                },
                noData: '找不到结果',
                depth: 4,
                hideOtherSidebarContent: false,
                namespace: 'Teletele-Blog',
            }
        }
    </script>
    <!-- docsify的js依赖 -->
    <script src="//cdn.jsdelivr.net/npm/docsify/lib/docsify.min.js"></script>
    <!-- emoji表情支持 -->
    <script src="//cdn.jsdelivr.net/npm/docsify/lib/plugins/emoji.min.js"></script>
    <!-- 图片放大缩小支持 -->
    <script src="//cdn.jsdelivr.net/npm/docsify/lib/plugins/zoom-image.min.js"></script>
    <!-- 搜索功能支持 -->
    <script src="//cdn.jsdelivr.net/npm/docsify/lib/plugins/search.min.js"></script>
    <!--在所有的代码块上添加一个简单的Click to copy按钮来允许用户从你的文档中轻易地复制代码-->
    <script src="//cdn.jsdelivr.net/npm/docsify-copy-code/dist/docsify-copy-code.min.js"></script>
</body>

</html>
```

### 创建并编辑 _sidebar.md

```markdown
<!-- _sidebar.md -->

* 搭建
  * [GitHub图床&博客一站式解决方案](/blogs/mess/GitHub图床&博客搭建.md)

```

### 创建并编辑 _navbar.md

```markdown
<!-- _navbar.md -->

* 链接到我
  * [关于本人](https://github.com/Teletele-Lin) 
  * [Github地址](https://github.com/Teletele-Lin)

* 友情链接
  * [Docsify](https://docsify.js.org/#/)
```

### 编写与上传文章

上述两个步骤做完后，博客的框架已经搭建完成，后续自己需要上传文章，只需要修改侧边栏的文件就行，文章写完后上传到GitHub即可生效