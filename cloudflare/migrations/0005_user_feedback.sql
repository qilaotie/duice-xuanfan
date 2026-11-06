CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK(kind IN ('issue', 'stall')),
    name TEXT,
    content TEXT NOT NULL,
    photo BLOB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'closed')),
    canteen_id INTEGER REFERENCES canteens(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);
