CREATE TABLE food_types (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE
);
INSERT INTO food_types (id, name) VALUES
    ('rice', '米饭套餐'), ('noodles', '面食粉类'), ('hotpot', '冒菜火锅'),
    ('stir-fry', '炒菜小炒'), ('snacks', '炸鸡汉堡与小吃'), ('light', '轻食沙拉'),
    ('drinks', '饮品甜点'), ('breakfast', '早餐粥点'),
    ('braised', '砂锅煲类与蒸菜'), ('retail', '水果与便利');
CREATE TABLE stall_food_overrides (
    canteen_id INTEGER PRIMARY KEY REFERENCES canteens(id) ON DELETE CASCADE,
    types TEXT NOT NULL CHECK (json_valid(types) AND json_type(types) = 'array')
);
