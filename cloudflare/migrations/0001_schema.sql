CREATE TABLE users (
	id INTEGER NOT NULL,
	username VARCHAR(50) NOT NULL,
	password VARCHAR(200) NOT NULL,
	is_admin BOOLEAN,
	token VARCHAR(64), nickname VARCHAR(24),
	PRIMARY KEY (id),
	UNIQUE (username),
	UNIQUE (token)
);

CREATE TABLE categories (
	id INTEGER NOT NULL,
	name VARCHAR(100) NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE canteens (
	id INTEGER NOT NULL,
	name VARCHAR(100) NOT NULL,
	category_id INTEGER, is_active BOOLEAN DEFAULT 1, photo BLOB,
	PRIMARY KEY (id),
	FOREIGN KEY(category_id) REFERENCES categories (id)
);

CREATE TABLE dishes (
	id INTEGER NOT NULL,
	canteen_id INTEGER NOT NULL,
	name VARCHAR(80) NOT NULL, photo BLOB,
	PRIMARY KEY (id),
	UNIQUE (canteen_id, name),
	FOREIGN KEY(canteen_id) REFERENCES canteens (id)
);

CREATE TABLE ratings (
	id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	canteen_id INTEGER NOT NULL,
	score FLOAT NOT NULL,
	comment TEXT,
	is_deleted BOOLEAN,
	created_at DATETIME, dish_name VARCHAR(80), photo BLOB, dish_scores JSON,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id),
	FOREIGN KEY(canteen_id) REFERENCES canteens (id)
);

CREATE TABLE reports (
	id INTEGER NOT NULL,
	user_id INTEGER,
	comment_id INTEGER,
	content TEXT NOT NULL,
	created_at DATETIME,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE admin_actions (
	id INTEGER NOT NULL,
	admin_user_id INTEGER NOT NULL,
	action VARCHAR(100) NOT NULL,
	target_type VARCHAR(50),
	target_id INTEGER,
	details TEXT,
	created_at DATETIME,
	PRIMARY KEY (id),
	FOREIGN KEY(admin_user_id) REFERENCES users (id)
);

CREATE TABLE rating_history (
                        id INTEGER PRIMARY KEY,
                        canteen_id INTEGER NOT NULL,
                        avg_score FLOAT,
                        rating_count INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
CREATE INDEX ratings_stall ON ratings(canteen_id, is_deleted);
CREATE INDEX ratings_author ON ratings(user_id, is_deleted);
CREATE UNIQUE INDEX ratings_one_active ON ratings(user_id, canteen_id) WHERE is_deleted = 0;
CREATE INDEX history_stall ON rating_history(canteen_id, created_at);
