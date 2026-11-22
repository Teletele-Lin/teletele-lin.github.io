# 查询处理

记录 PostgreSQL SQL 引擎的学习和总结，沿着查询流程逐步理解各个阶段。

## 阅读顺序

1. [查询处理流程](/blogs/postgres/查询处理/exec_query.md)：从整体执行路径入手。
2. [语法解析](/blogs/postgres/查询处理/parser.md)：语法解析笔记，待补充。
3. [优化器](/blogs/postgres/查询处理/optimizer.md)：使用 GDB 跟踪优化器，并观察不同 SQL 的计划选择。
