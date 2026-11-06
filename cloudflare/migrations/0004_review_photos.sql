CREATE TABLE review_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rating_id INTEGER NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
    photo BLOB NOT NULL
);
CREATE INDEX review_photos_rating ON review_photos(rating_id, id);

CREATE TRIGGER review_photos_limit BEFORE INSERT ON review_photos
WHEN (SELECT COUNT(*) FROM review_photos WHERE rating_id=NEW.rating_id)
    + (SELECT photo IS NOT NULL FROM ratings WHERE id=NEW.rating_id) >= 4
BEGIN
    SELECT RAISE(ABORT, 'review photo limit');
END;
