CREATE TABLE review_labels (
    name TEXT NOT NULL PRIMARY KEY CHECK (length(name) BETWEEN 1 AND 20)
);
INSERT INTO review_labels (name) VALUES ('反串');
INSERT OR IGNORE INTO review_labels (name)
    SELECT DISTINCT moderation_label FROM ratings WHERE moderation_label IS NOT NULL;
