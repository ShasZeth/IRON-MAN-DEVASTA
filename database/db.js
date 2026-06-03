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
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tiles (
    id INTEGER PRIMARY KEY,
    taken INTEGER DEFAULT 0,
    takenby INTEGER,
    takenat TIMESTAMP,
    screenshot_url TEXT
)
        `);

        await pool.query(`
    ALTER TABLE tiles
    ADD COLUMN IF NOT EXISTS screenshot_url TEXT
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
                INSERT INTO tiles (id, taken)
                VALUES ($1, 0)
                ON CONFLICT (id) DO NOTHING
                `,
                [i]
            );
        }

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