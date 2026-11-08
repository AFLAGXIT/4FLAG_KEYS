const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const dbPath = process.env.RAILWAY_ENVIRONMENT ? '/var/data/auth.db' : './auth.db';
const db = new sqlite3.Database(dbPath);

// 1. Table dyal l'Apps
db.run(`CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 2. Table dyal l'Users (m3a app_id)
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER,
    username TEXT, 
    key TEXT UNIQUE,
    password TEXT,
    hwid TEXT,
    expiry_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(app_id) REFERENCES apps(id)
)`);

// Zid app "4FLAG Application" ila ma kanatch
db.get(`SELECT * FROM apps WHERE name = '4FLAG Application'`, (err, row) => {
    if (!row) {
        db.run(`INSERT INTO apps (name) VALUES ('4FLAG Application')`);
    }
});

function generateKey() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// 3. Login (kay9bel app_id)
app.post('/api/login', (req, res) => {
    const { app_id, key, password, hwid } = req.body; 
    if (!app_id || !key || !password || !hwid) return res.status(400).json({ error: "Missing fields" });

    db.get(`SELECT * FROM users WHERE app_id = ? AND username = ? AND password = ?`, [app_id, key, password], (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!row) return res.status(401).json({ error: "Invalid username or password" });

        if (row.expiry_date) {
            const today = new Date().toISOString().split('T')[0];
            if (today > row.expiry_date) return res.status(403).json({ error: "License has expired" });
        }

        if (row.hwid === "PENDING") {
            db.run(`UPDATE users SET hwid = ? WHERE id = ?`, [hwid, row.id]);
        } 
        else if (row.hwid && row.hwid !== "NO_HWID" && row.hwid !== hwid) {
            return res.status(403).json({ error: "HWID mismatch." });
        }

        res.json({ success: true, message: "Logged in successfully" });
    });
});

// 4. Generate User (kayakhod app_id)
app.post('/api/generate', (req, res) => {
    const { app_id, username, password, expiry, hwid } = req.body; 
    const newKey = generateKey(); 
    const finalPass = password ? password : "123456"; 
    let hwidStatus = (hwid === "1") ? "PENDING" : "NO_HWID";

    db.run(`INSERT INTO users (app_id, username, key, password, expiry_date, hwid) VALUES (?, ?, ?, ?, ?, ?)`, 
        [app_id, username, newKey, finalPass, expiry, hwidStatus], function(err) {
        if (err) return res.status(500).json({ error: "Database error: " + err.message });
        res.json({ success: true });
    });
});

// 5. Admin Users List (kayakhod app_id)
app.get('/api/admin/users/:app_id', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "APOSTADO99") return res.status(401).json({ error: "Unauthorized" });
    
    const app_id = req.params.app_id;
    db.all(`SELECT * FROM users WHERE app_id = ? ORDER BY id DESC`, [app_id], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// 6. Delete User
app.post('/api/admin/delete', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "APOSTADO99") return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.body;
    db.run(`DELETE FROM users WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ success: true });
    });
});

// 7. Jib l'Apps koulhom
app.get('/api/admin/apps', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "APOSTADO99") return res.status(401).json({ error: "Unauthorized" });
    
    db.all(`SELECT * FROM apps ORDER BY id ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// 8. Zid App jdida
app.post('/api/admin/apps', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "APOSTADO99") return res.status(401).json({ error: "Unauthorized" });

    const { name } = req.body;
    db.run(`INSERT INTO apps (name) VALUES (?)`, [name], function(err) {
        if (err) return res.status(500).json({ error: "Database error: " + err.message });
        res.json({ success: true, id: this.lastID });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});