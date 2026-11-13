CREATE TABLE IF NOT EXISTS recommendation_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_public INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS recommendation_lists_author ON recommendation_lists(user_id, is_public, id);

CREATE TABLE IF NOT EXISTS recommendation_items (
    list_id INTEGER NOT NULL REFERENCES recommendation_lists(id) ON DELETE CASCADE,
    stall_id INTEGER NOT NULL,
    removed_name TEXT,
    dish_ids TEXT NOT NULL DEFAULT '[]',
    reason TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (list_id, stall_id)
);

CREATE TABLE IF NOT EXISTS recommendation_saves (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_id INTEGER NOT NULL REFERENCES recommendation_lists(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, list_id)
);

CREATE TRIGGER IF NOT EXISTS recommendation_stall_deleted AFTER DELETE ON canteens
BEGIN
    UPDATE recommendation_items SET removed_name=OLD.name, dish_ids='[]'
    WHERE stall_id=OLD.id AND removed_name IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS recommendation_dish_deleted AFTER DELETE ON dishes
BEGIN
    UPDATE recommendation_items SET dish_ids=(
        SELECT json_group_array(j.value) FROM json_each(dish_ids) j WHERE j.value<>OLD.id
    )
    WHERE stall_id=OLD.canteen_id AND EXISTS (SELECT 1 FROM json_each(dish_ids) WHERE value=OLD.id);
END;