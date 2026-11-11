ALTER TABLE ratings ADD COLUMN moderation_label TEXT;
CREATE TABLE review_votes (
    rating_id INTEGER NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
    PRIMARY KEY (rating_id, user_id)
);
