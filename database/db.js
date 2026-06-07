const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                nickname TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                isadmin INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                bonus_points INTEGER DEFAULT 0,
                admin_bonus_points INTEGER DEFAULT 0,
                admin_penalty_points INTEGER DEFAULT 0
            )
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS bonus_points INTEGER DEFAULT 0
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS admin_bonus_points INTEGER DEFAULT 0
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS admin_penalty_points INTEGER DEFAULT 0
        `);

        /*
            Jednorazowa migracja ze starego systemu:
            bonus_points było wcześniej jedną wartością netto.
            Jeśli ktoś miał wartość dodatnią, trafia jako premia admina.
            Jeśli ktoś miał wartość ujemną, trafia jako kara punktowa.
        */
        await pool.query(`
            UPDATE users
            SET admin_bonus_points = CASE
                    WHEN COALESCE(bonus_points, 0) > 0 THEN COALESCE(bonus_points, 0)
                    ELSE 0
                END,
                admin_penalty_points = CASE
                    WHEN COALESCE(bonus_points, 0) < 0 THEN ABS(COALESCE(bonus_points, 0))
                    ELSE 0
                END
            WHERE COALESCE(admin_bonus_points, 0) = 0
              AND COALESCE(admin_penalty_points, 0) = 0
              AND COALESCE(bonus_points, 0) <> 0
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tiles (
                id INTEGER PRIMARY KEY,
                tile_number INTEGER,
                taken INTEGER DEFAULT 0,
                takenby INTEGER,
                takenat TIMESTAMP,
                screenshot_url TEXT,
                points INTEGER DEFAULT 0,
                is_special INTEGER DEFAULT 0,
                special_number INTEGER,
                unlock_at TIMESTAMP
            )
        `);

        await pool.query(`
            ALTER TABLE tiles
            ADD COLUMN IF NOT EXISTS screenshot_url TEXT
        `);

        await pool.query(`
            ALTER TABLE tiles
            ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0
        `);

        await pool.query(`
            ALTER TABLE tiles
            ADD COLUMN IF NOT EXISTS tile_name VARCHAR(50)
        `);

        await pool.query(`
            ALTER TABLE tiles
            ADD COLUMN IF NOT EXISTS is_special INTEGER DEFAULT 0
        `);

        await pool.query(`
            ALTER TABLE tiles
            ADD COLUMN IF NOT EXISTS special_number INTEGER
        `);

        await pool.query(`
            ALTER TABLE tiles
            ADD COLUMN IF NOT EXISTS tile_number INTEGER
        `);

        await pool.query(`
            ALTER TABLE tiles
            ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMP
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);

        await pool.query(`
            INSERT INTO app_settings (key, value)
            VALUES ('board_locked_until', NULL)
            ON CONFLICT (key) DO NOTHING
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS board_lock (
                id INTEGER PRIMARY KEY,
                locked_until TIMESTAMP
            )
        `);

        await pool.query(`
            INSERT INTO board_lock (id, locked_until)
            VALUES (1, NULL)
            ON CONFLICT (id) DO NOTHING
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tile_history (
                id SERIAL PRIMARY KEY,
                tile_id INTEGER,
                user_id INTEGER,
                action TEXT NOT NULL,
                note TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        for (let i = 1; i <= 50; i++) {
            await pool.query(
                `
                INSERT INTO tiles (id, tile_number, taken)
                VALUES ($1, $1, 0)
                ON CONFLICT (id) DO NOTHING
                `,
                [i]
            );
        }

        await pool.query(`
            WITH numbered_tiles AS (
                SELECT 
                    id,
                    ROW_NUMBER() OVER (ORDER BY id) AS new_tile_number
                FROM tiles
                WHERE COALESCE(is_special, 0) = 0
            )
            UPDATE tiles
            SET tile_number = numbered_tiles.new_tile_number
            FROM numbered_tiles
            WHERE tiles.id = numbered_tiles.id
        `);

        console.log("Połączono z PostgreSQL");
    } catch (err) {
        console.error("Błąd PostgreSQL:", err.message);
    }
}

initDatabase();

const db = {
    run(sql, params = [], callback = () => {}) {
        const convertedSql = convertSql(sql);

        pool.query(convertedSql, params)
            .then(result => {
                callback.call(
                    {
                        lastID: result.rows?.[0]?.id,
                        changes: result.rowCount
                    },
                    null
                );
            })
            .catch(err => callback(err));
    },

    get(sql, params = [], callback) {
        const convertedSql = convertSql(sql);

        pool.query(convertedSql, params)
            .then(result => {
                callback(null, result.rows[0]);
            })
            .catch(err => callback(err));
    },

    all(sql, params = [], callback) {
        const convertedSql = convertSql(sql);

        pool.query(convertedSql, params)
            .then(result => {
                callback(null, result.rows);
            })
            .catch(err => callback(err));
    }
};

function convertSql(sql) {
    let index = 0;

    return sql
        .replace(/datetime\('now'\)/g, "NOW()")
        .replace(/\?/g, () => {
            index++;
            return `$${index}`;
        });
}

module.exports = db;
