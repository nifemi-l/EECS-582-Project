-- Incremental migration: Room + Feature.room_id (safe for existing DBs).
-- Idempotent: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- No DROP.

CREATE TABLE IF NOT EXISTS Room (
    room_id SERIAL PRIMARY KEY CHECK (room_id > 0),
    household_id INTEGER NOT NULL
        REFERENCES Household(household_id) ON DELETE CASCADE,
    room_name VARCHAR(80) NOT NULL,
    accent_color VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_household ON Room (household_id);

ALTER TABLE Feature ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES Room(room_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feature_room ON Feature (room_id);
