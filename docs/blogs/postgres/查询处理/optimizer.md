# 使用GDB跟踪优化器执行流程
## DDL
```sql
-- 创建测试数据库
CREATE DATABASE optimizer_demo;
\c optimizer_demo

-- 客户表
CREATE TABLE customers (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    country VARCHAR(50),
    city VARCHAR(50),
    registration_date DATE
);

-- 产品表
CREATE TABLE products (
    id INT PRIMARY KEY,
    name VARCHAR(200),
    category VARCHAR(50),
    price DECIMAL(10,2),
    supplier_id INT
);

-- 订单表（核心事实表）
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    customer_id INT REFERENCES customers(id),
    product_id INT REFERENCES products(id),
    quantity INT,
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(12,2),  -- quantity * unit_price
    order_date DATE,
    status VARCHAR(20),
    -- 添加一些额外的列以增加复杂性
    discount DECIMAL(5,2),
    tax DECIMAL(10,2),
    shipping_cost DECIMAL(10,2)
);

-- 订单详情表（用于测试连接和聚合）
CREATE TABLE order_details (
    order_id BIGINT REFERENCES orders(id),
    detail_number INT,
    notes TEXT,
    updated_at TIMESTAMP,
    PRIMARY KEY (order_id, detail_number)
);

-- 在关键字段上创建索引（优化器会考虑使用这些索引）
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_product_id ON orders(product_id);
CREATE INDEX idx_customers_country ON customers(country);
CREATE INDEX idx_customers_city ON customers(city);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_price ON products(price);

```
## DML
```sql
-- 插入1000个客户
INSERT INTO customers (id, name, country, city, registration_date)
SELECT 
    g.id,
    'Customer_' || g.id,
    CASE WHEN g.id % 10 = 0 THEN 'US' 
         WHEN g.id % 10 = 1 THEN 'UK'
         WHEN g.id % 10 = 2 THEN 'Germany'
         WHEN g.id % 10 = 3 THEN 'France'
         WHEN g.id % 10 = 4 THEN 'Japan'
         ELSE 'Other' END,
    CASE WHEN g.id % 20 = 0 THEN 'New York'
         WHEN g.id % 20 = 1 THEN 'London'
         WHEN g.id % 20 = 2 THEN 'Berlin'
         ELSE 'City_' || (g.id % 100) END,
    '2020-01-01'::DATE + (g.id % 1000) * INTERVAL '1 day'
FROM generate_series(1, 1000) g(id);

-- 插入500个产品
INSERT INTO products (id, name, category, price, supplier_id)
SELECT
    g.id,
    'Product_' || g.id,
    CASE WHEN g.id % 5 = 0 THEN 'Electronics'
         WHEN g.id % 5 = 1 THEN 'Clothing'
         WHEN g.id % 5 = 2 THEN 'Books'
         WHEN g.id % 5 = 3 THEN 'Home'
         ELSE 'Other' END,
    (g.id % 1000) + 19.99,
    g.id % 50
FROM generate_series(1, 500) g(id);

-- 插入100,000个订单（大数据量让优化器的决策更重要）
INSERT INTO orders (id, customer_id, product_id, quantity, unit_price, total_amount, order_date, status, discount, tax, shipping_cost)
SELECT
    g.id,
    (g.id % 1000) + 1,  -- 关联到存在的客户
    (g.id % 500) + 1,   -- 关联到存在的产品
    (g.id % 10) + 1,
    p.price,
    ((g.id % 10) + 1) * p.price * (1 - (g.id % 5) * 0.05),
    '2023-01-01'::DATE + (g.id % 365) * INTERVAL '1 day',
    CASE WHEN g.id % 100 = 0 THEN 'Cancelled'
         WHEN g.id % 100 = 1 THEN 'Pending'
         ELSE 'Completed' END,
    (g.id % 5) * 0.05,
    ((g.id % 10) + 1) * p.price * 0.08,
    CASE WHEN (g.id % 100) < 10 THEN 0
         WHEN (g.id % 100) < 30 THEN 5.99
         ELSE 9.99 END
FROM generate_series(1, 100000) g(id)
JOIN products p ON p.id = ((g.id % 500) + 1);

-- 插入订单详情（约150,000行）
INSERT INTO order_details (order_id, detail_number, notes, updated_at)
SELECT
    o.id,
    d.detail_num,
    'Note for order ' || o.id || ' detail ' || d.detail_num,
    o.order_date::TIMESTAMP + (d.detail_num * INTERVAL '1 hour')
FROM orders o
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) d(detail_num)
WHERE o.id % 4 = 0;  -- 只对1/4的订单添加详情

-- 更新统计信息（重要！优化器依赖统计信息做决策）
ANALYZE customers;
ANALYZE products;
ANALYZE orders;
ANALYZE order_details;

```

## SQL跟踪示例
### 查询1：基础单表查询（查看索引选择）
```sql
-- 优化器需要决定：使用索引扫描还是全表扫描？
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM orders 
WHERE order_date BETWEEN '2023-06-01' AND '2023-06-30'
  AND status = 'Completed';

```

### 查询2：多条件查询（查看条件过滤顺序）
```sql
-- 优化器如何评估不同条件的过滤性？哪个条件先应用？
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders
WHERE customer_id IN (100, 200, 300, 400, 500)
  AND product_id > 400
  AND total_amount > 1000
  AND order_date > '2023-05-01';

```

### 查询3：两表JOIN（查看连接算法和顺序）
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.name, c.country, o.order_date, o.total_amount
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE c.country = 'US'
  AND o.order_date >= '2023-07-01';
```

### 查询4：三表JOIN（查看多表连接顺序优化）
```sql
-- 优化器如何决定连接顺序？(c JOIN o) JOIN p 还是 (o JOIN p) JOIN c？
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.name, p.name, SUM(o.quantity) as total_quantity
FROM customers c
JOIN orders o ON c.id = o.customer_id
JOIN products p ON o.product_id = p.id
WHERE c.country IN ('US', 'UK')
  AND p.category = 'Electronics'
  AND o.order_date BETWEEN '2023-01-01' AND '2023-06-30'
GROUP BY c.name, p.name
HAVING SUM(o.total_amount) > 5000
ORDER BY total_quantity DESC
LIMIT 10;

```

### 查询5：复杂聚合与子查询
```sql
-- 优化器如何处理子查询？会将其转换为JOIN吗？
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    c.country,
    COUNT(DISTINCT o.id) as order_count,
    AVG(o.total_amount) as avg_order_value,
    (
        SELECT COUNT(*) 
        FROM orders o2 
        WHERE o2.customer_id = c.id 
          AND o2.status = 'Cancelled'
    ) as cancelled_orders
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE c.registration_date > '2022-01-01'
  AND o.order_date > '2023-01-01'
GROUP BY c.id, c.country
HAVING COUNT(o.id) > 5
ORDER BY avg_order_value DESC;

```

### 查询6：CTE（公共表表达式）优化
```sql
-- 优化器会物化CTE吗？还是将其内联？
EXPLAIN (ANALYZE, BUFFERS)
WITH us_customers AS (
    SELECT id, name, city
    FROM customers
    WHERE country = 'US'
),
recent_orders AS (
    SELECT customer_id, SUM(total_amount) as total_spent
    FROM orders
    WHERE order_date >= '2023-09-01'
    GROUP BY customer_id
)
SELECT 
    uc.name,
    uc.city,
    ro.total_spent,
    COUNT(o.id) as order_count
FROM us_customers uc
JOIN recent_orders ro ON uc.id = ro.customer_id
LEFT JOIN orders o ON uc.id = o.customer_id
GROUP BY uc.id, uc.name, uc.city, ro.total_spent
ORDER BY ro.total_spent DESC
LIMIT 20;

```

## 未完待续...

