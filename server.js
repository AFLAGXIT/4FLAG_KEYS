const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

// L'PATH DYAL L'VOLUME F RAILWAY
const dbPath = process.env.RAILWAY_ENVIRONMENT ? '/var/data/auth.db' : './auth.db';
const db = new sqlite3.Database(dbPath);

// 1. Table dyal l'Apps
db.run(`CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    ownerid TEXT,
    secret TEXT,
    version TEXT,
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
        const newOwnerId = crypto.randomBytes(8).toString('hex').toUpperCase();
        const newSecret = crypto.randomBytes(16).toString('hex');
        db.run(`INSERT INTO apps (name, ownerid, secret, version) VALUES ('4FLAG Application', ?, ?, '1.2')`, [newOwnerId, newSecret]);
    }
});

function generateKey() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// ==========================================
// --- DISCORD OAUTH ---
// ==========================================
const DISCORD_CLIENT_ID = "1568790262409338941";
const DISCORD_CLIENT_SECRET = "3QtsHZ706n2azm1UY1derrosR6aPcIet";
const DISCORD_REDIRECT_URI = "https://4flagkeys-production-8b1a.up.railway.app/api/auth/discord/callback";

app.get('/api/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("No code provided");

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: DISCORD_REDIRECT_URI,
                scope: 'identify',
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const userData = await userResponse.json();

        const userJson = JSON.stringify({ username: userData.global_name || userData.username, id: userData.id, avatar: userData.avatar });
        res.redirect(`https://4flag-webkeys.vercel.app/index.html?discord=${encodeURIComponent(userJson)}`);
    } catch (error) {
        res.status(500).send("Discord auth failed");
    }
});

// ==========================================
// --- APP & USER API ---
// ==========================================

// 3. Login dyal l'Panel C++
app.post('/api/login', (req, res) => {
    const { app_name, ownerid, secret, key, password, hwid } = req.body; 
    if (!app_name || !ownerid || !secret || !key || !password || !hwid) return res.status(400).json({ error: "Missing fields" });

    db.get(`SELECT * FROM apps WHERE name = ? AND ownerid = ? AND secret = ?`, [app_name, ownerid, secret], (err, appRow) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!appRow) return res.status(401).json({ error: "Invalid App credentials" });

        db.get(`SELECT * FROM users WHERE app_id = ? AND username = ? AND password = ?`, [appRow.id, key, password], (err, row) => {
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
});

// 4. Generate User
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

// 5. Jib l'Users dyal app
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
    const newOwnerId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const newSecret = crypto.randomBytes(16).toString('hex');
    const version = "1.0";
    
    db.run(`INSERT INTO apps (name, ownerid, secret, version) VALUES (?, ?, ?, ?)`, 
        [name, newOwnerId, newSecret, version], function(err) {
        if (err) return res.status(500).json({ error: "Database error: " + err.message });
        res.json({ success: true, id: this.lastID, ownerid: newOwnerId, secret: newSecret, version: version });
    });
});

// 9. Delete App (kaymse7 l'app w l'users dyalha)
app.delete('/api/admin/apps/:app_id', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "APOSTADO99") return res.status(401).json({ error: "Unauthorized" });

    const app_id = req.params.app_id;
    
    db.run(`DELETE FROM users WHERE app_id = ?`, [app_id], function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        db.run(`DELETE FROM apps WHERE id = ?`, [app_id], function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json({ success: true });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});