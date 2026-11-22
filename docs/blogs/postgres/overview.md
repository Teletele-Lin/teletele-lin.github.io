# PostgreSQL 内核

记录对 [PostgreSQL](https://github.com/postgres/postgres) 内核的学习和总结。从搭建开发环境开始，沿着 SQL 执行路径阅读源码，再借助调试与可视化工具理解内部行为。

## 开发与分析

- [开发与调试环境](/blogs/postgres/配置pg开发环境.md)：编译源码、启动数据库，以及配置 VS Code 调试。
- [性能分析：火焰图](/blogs/postgres/pg火焰图抓取.md)：采集调用栈，生成火焰图，观察执行热点。
- [解析与计划可视化](/blogs/postgres/可视化.md)：在 GDB 和 psql 中观察解析树与查询计划。

## 查询处理

- [查询处理专题](/blogs/postgres/查询处理/overview.md)：梳理查询流程、语法解析和优化器的学习笔记。
