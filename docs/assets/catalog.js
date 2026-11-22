// 卡片目录：新增文章时，在所属 children 中填写 Markdown 路径、标题和摘要。
// 带 children 的条目是目录，可以继续嵌套；文章正文仍保存在原来的 Markdown 文件中。
window.TeleteleCatalog = {
    sections: [
        {
            id: 'postgres', title: 'PostgreSQL 内核', label: '数据库', cover: 'PostgreSQL', tone: 'teal',
            path: '/blogs/postgres/overview',
            description: '沿着一条 SQL 的执行路径，阅读源码、跟踪查询，也记录调试与性能分析的实践。',
            children: [
                {
                    title: '开发与调试环境', cover: 'BUILD / DEBUG', label: '开发环境',
                    path: '/blogs/postgres/配置pg开发环境',
                    description: '从源码编译、数据库启动，到 VS Code 与 GDB 的调试配置。',
                    tags: ['PostgreSQL', 'GDB', 'VS Code']
                },
                {
                    title: '性能分析：火焰图', cover: 'FlameGraph', label: '性能分析',
                    path: '/blogs/postgres/pg火焰图抓取',
                    description: '采集 PostgreSQL 调用栈，生成火焰图，观察执行热点。',
                    tags: ['perf', '性能分析']
                },
                {
                    title: '解析与计划可视化', cover: 'EXPLAIN', label: '可视化',
                    path: '/blogs/postgres/可视化',
                    description: '在 GDB 和 psql 中查看解析树与查询计划，让内部结构更直观。',
                    tags: ['查询计划', 'GDB']
                },
                {
                    id: 'query', title: '查询处理', cover: 'SQL ENGINE', label: '专题目录',
                    path: '/blogs/postgres/查询处理/overview',
                    description: '从查询流程到语法解析、优化器，逐步理解 SQL 引擎。',
                    children: [
                        {
                            title: '查询处理流程', cover: 'SQL / RESULT', label: '执行流程',
                            path: '/blogs/postgres/查询处理/exec_query',
                            description: '一条 SQL 是怎样执行的？从整体流程理解 PostgreSQL 的查询处理路径。',
                            tags: ['SQL', '查询处理']
                        },
                        {
                            title: '语法解析', cover: 'PARSER', label: '源码笔记', status: '待补充',
                            path: '/blogs/postgres/查询处理/parser',
                            description: 'PostgreSQL 语法解析笔记，内容待补充。', tags: ['Parser']
                        },
                        {
                            title: '优化器', cover: 'OPTIMIZER', label: '源码调试',
                            path: '/blogs/postgres/查询处理/optimizer',
                            description: '用 GDB 跟踪优化器，比较不同 SQL 的计划选择与执行路径。',
                            tags: ['优化器', 'GDB', 'SQL']
                        }
                    ]
                }
            ]
        },
        {
            id: 'tools', title: '工具与环境', label: '开发实践', cover: 'Dev / Tools', tone: 'blue',
            path: '/blogs/mess/overview',
            description: '搭建顺手的开发环境，记录远程开发、工具配置，以及这个博客的搭建过程。',
            children: [
                {
                    title: 'GitHub 图床与博客搭建', cover: 'WRITE / PUBLISH', label: '博客搭建',
                    path: '/blogs/mess/GitHub图床&博客搭建',
                    description: '用 GitHub、PicGo 和 Docsify 搭建图床与博客，串起写作和发布流程。',
                    tags: ['GitHub', 'Docsify', 'PicGo']
                },
                {
                    title: '远程 Python 与 Jupyter', cover: 'Python / Jupyter', label: '远程开发',
                    path: '/blogs/mess/VSCode搭建远程Python与Jupyter开发环境(Miniconda)',
                    description: '用 Miniconda 管理 Python 环境，在 VS Code 中连接远程 Jupyter。',
                    tags: ['Python', 'Jupyter', 'VS Code']
                },
                {
                    title: '远程 Rust 开发', cover: 'Rust / Remote', label: '远程开发',
                    path: '/blogs/mess/VSCode搭建远程Rust开发环境',
                    description: '安装 Rust 工具链，配置 rust-analyzer，搭建远程开发与调试环境。',
                    tags: ['Rust', 'VS Code']
                }
            ]
        },
        {
            id: 'ai', title: 'AI 与思考', label: '对话与观察', cover: 'Chat & Ideas', tone: 'violet',
            path: '/blogs/AIChat/overview',
            description: '关于学习、自我进化、AI 产业和财富转移的对话。保留问题，也保留思考的过程。',
            children: [
                {
                    title: '自我进化是否客观存在？', cover: 'SELF / GROWTH', label: '学习与成长',
                    path: '/blogs/AIChat/01-自我进化是否客观存在？',
                    description: '从自我进化这个问题开始，展开关于成长和改变的对话。',
                    tags: ['自我进化', 'AI 对话']
                },
                {
                    title: '学习的苦与乐', cover: 'LEARN / THINK', label: '学习与成长',
                    path: '/blogs/AIChat/02-学习的苦与乐',
                    description: '关于学习过程、付出与收获的讨论。', tags: ['学习', 'AI 对话']
                },
                {
                    title: 'AI 产业图谱', cover: 'AI / LANDSCAPE', label: '产业观察',
                    path: '/blogs/AIChat/03-AI产业图谱',
                    description: '从编程工具到应用形态，梳理 AI 产业的不同方向。',
                    tags: ['AI 产业', '编程工具']
                },
                {
                    title: '财富转移之讨论', cover: 'WEALTH / CHANGE', label: '社会观察',
                    path: '/blogs/AIChat/04-财富转移之讨论',
                    description: '围绕财富转移展开的一组提问与讨论。', tags: ['财富', 'AI 对话']
                }
            ]
        }
    ],
    featured: [
        '/blogs/postgres/查询处理/exec_query',
        '/blogs/mess/VSCode搭建远程Python与Jupyter开发环境(Miniconda)',
        '/blogs/AIChat/03-AI产业图谱'
    ]
};
