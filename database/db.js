const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "../data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, "board.db");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Błąd bazy danych:", err.message);
    } else {
        console.log("Połączono z SQLite");
    }
});

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    isAdmin INTEGER DEFAULT 0
)
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS tiles (
            id INTEGER PRIMARY KEY,
            taken INTEGER DEFAULT 0,
            takenBy INTEGER,
            takenAt TEXT
        )
    `);

    for (let i = 1; i <= 50; i++) {
        db.run(
            "INSERT OR IGNORE INTO tiles (id, taken) VALUES (?, 0)",
            [i]
        );
    }
});

module.exports = db;