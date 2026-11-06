ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'canteen' CHECK(kind IN ('canteen', 'campus'));
ALTER TABLE feedback ADD COLUMN suggested_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
INSERT INTO categories (id, name, kind) VALUES
    (100001, '老综合楼一楼', 'campus'), (100002, '老综合楼二楼', 'campus'),
    (100003, '新综合楼一楼', 'campus'), (100004, '新综合楼二楼', 'campus'),
    (100005, '丁香综合楼一楼', 'campus'), (100006, '丁香综合楼二楼', 'campus'),
    (100007, '家属区（综合楼）', 'campus');
