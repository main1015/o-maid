const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 兼容迁移：若已有旧数据库表则补充 role 字段
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", (err) => {
        // duplicate column name 报错表示已存在该字段，忽略即可
        // 保证平台中至少有一位初始用户为 admin
        db.get("SELECT COUNT(*) as adminCount FROM users WHERE role = 'admin'", [], (err, row) => {
            if (!err && (!row || row.adminCount === 0)) {
                db.run("UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)");
            }
        });
    });

    // Guides table
    db.run(`
        CREATE TABLE IF NOT EXISTS guides (
            id TEXT PRIMARY KEY,
            name TEXT,
            startUrl TEXT,
            domain TEXT,
            steps TEXT,
            authorId INTEGER,
            downloads INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(authorId) REFERENCES users(id)
        )
    `);

    // Hints table
    db.run(`
        CREATE TABLE IF NOT EXISTS hints (
            id TEXT PRIMARY KEY,
            url TEXT,
            domain TEXT,
            selector TEXT,
            text TEXT,
            authorId INTEGER,
            downloads INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(authorId) REFERENCES users(id)
        )
    `);

    // 兼容迁移：若已有旧 hints 表则平滑补充 downloads 字段
    db.run("ALTER TABLE hints ADD COLUMN downloads INTEGER DEFAULT 0", (err) => {
        // duplicate column name 报错表示已存在该字段，忽略即可
    });
});

module.exports = db;
