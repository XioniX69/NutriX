-- =========================================================================
-- NUTRIX — Cloudflare D1 (SQLite) Schema для режима «Семья» и телеметрии
-- Команда применения:
--   npx wrangler d1 execute nutrix-db --remote --file=./worker/schema.sql
-- =========================================================================

CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    owner_tg_id INTEGER NOT NULL,
    shared_slots_json TEXT NOT NULL DEFAULT '["dinner"]',
    coop_streak INTEGER NOT NULL DEFAULT 0,
    last_coop_date TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_families_invite ON families(invite_code);

CREATE TABLE IF NOT EXISTS family_members (
    family_id TEXT NOT NULL,
    tg_id INTEGER NOT NULL,
    first_name TEXT NOT NULL,
    username TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member' | 'shopper_only'
    daily_kcal INTEGER NOT NULL DEFAULT 2000,
    meals_count INTEGER NOT NULL DEFAULT 4,
    preferences_text TEXT DEFAULT '',
    streak_days INTEGER NOT NULL DEFAULT 0,
    share_wins INTEGER NOT NULL DEFAULT 1,
    grocery_contrib_json TEXT DEFAULT '[]',
    in_store_since INTEGER DEFAULT 0,
    last_day_done_date TEXT DEFAULT '',
    joined_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (family_id, tg_id),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_family_members_tg ON family_members(tg_id);

CREATE TABLE IF NOT EXISTS family_shared_meals (
    family_id TEXT NOT NULL,
    day_index INTEGER NOT NULL,
    slot_key TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    dish_title TEXT NOT NULL,
    cook_tg_id INTEGER,
    cook_name TEXT DEFAULT '',
    updated_by INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (family_id, day_index, slot_key),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_eating_out (
    family_id TEXT NOT NULL,
    date_str TEXT NOT NULL,
    slot_key TEXT NOT NULL,
    tg_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (family_id, date_str, slot_key, tg_id),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_dinner_votes (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    day_index INTEGER NOT NULL,
    slot_key TEXT NOT NULL DEFAULT 'dinner',
    status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'applied'
    candidates_json TEXT NOT NULL,       -- [{ recipe_id, title_ru, kcal, time_min }]
    votes_json TEXT NOT NULL DEFAULT '{}', -- { "<tg_id>": { "<recipe_id>": 2|1|-1 } }
    created_by INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_votes_family ON family_dinner_votes(family_id, status);

CREATE TABLE IF NOT EXISTS family_grocery_checks (
    family_id TEXT NOT NULL,
    item_key TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    actor_tg_id INTEGER NOT NULL,
    actor_name TEXT DEFAULT '',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (family_id, item_key),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_grocery_urgent (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    note TEXT DEFAULT '',
    added_by_tg_id INTEGER NOT NULL,
    added_by_name TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_urgent_family ON family_grocery_urgent(family_id, created_at);

CREATE TABLE IF NOT EXISTS family_achievement_pushes (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    actor_tg_id INTEGER NOT NULL,
    recipient_tg_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    date_str TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ach_limit ON family_achievement_pushes(recipient_tg_id, date_str);

CREATE TABLE IF NOT EXISTS telemetry_users (
    tg_id INTEGER PRIMARY KEY,
    platform TEXT DEFAULT 'web',
    db_count INTEGER DEFAULT 0,
    last_seen INTEGER NOT NULL
);
