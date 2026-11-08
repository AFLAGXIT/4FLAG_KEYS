const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const dbPath = process.env.RAILWAY_ENVIRONMENT ? '/var/data/auth.db' : './auth.db';
const db = new sqlite3.Database(dbPath);

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT, 
    key TEXT UNIQUE,
    password TEXT,
    hwid TEXT,
    expiry_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

function generateKey() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
}

app.post('/api/login', (req, res) => {
    const { key, password, hwid } = req.body; 
    if (!key || !password || !hwid) return res.status(400).json({ error: "Missing fields" });

    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [key, password], (err, row) => {
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

app.post('/api/generate', (req, res) => {
    const { username, password, expiry, hwid } = req.body; 
    const newKey = generateKey(); 
    const finalPass = password ? password : "123456"; 
    let hwidStatus = (hwid === "1") ? "PENDING" : "NO_HWID";

    db.run(`INSERT INTO users (username, key, password, expiry_date, hwid) VALUES (?, ?, ?, ?, ?)`, 
        [username, newKey, finalPass, expiry, hwidStatus], function(err) {
        if (err) return res.status(500).json({ error: "Database error: " + err.message });
        res.json({ success: true });
    });
});

app.get('/api/admin/users', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "admin123") return res.status(401).json({ error: "Unauthorized" });
    
    db.all(`SELECT * FROM users ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

app.post('/api/admin/delete', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "admin123") return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.body;
    db.run(`DELETE FROM users WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});