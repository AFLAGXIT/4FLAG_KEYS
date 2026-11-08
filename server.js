const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

// HNA KAN-KHDOU L'PATH DYAL L'VOLUME DYAL RAILWAY BACH L'USERS YB9AW LIFE TIME
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

// 1. Login (Panel C++)
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

// 2. Generate User (Site)
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

// 3. Admin Users List
app.get('/api/admin/users', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "admin123") return res.status(401).json({ error: "Unauthorized" });
    
    db.all(`SELECT * FROM users ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// 4. Delete User
app.post('/api/admin/delete', (req, res) => {
    const pass = req.headers['x-admin-password'];
    if (pass !== "admin123") return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.body;
    db.run(`DELETE FROM users WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ success: true });
    });
});

// --- DISCORD OAUTH CONFIG ---
const DISCORD_CLIENT_ID = "1568790262409338941";
const DISCORD_CLIENT_SECRET = "3QtsHZ706n2azm1UY1derrosR6aPcIet";
const DISCORD_REDIRECT_URI = "https://4flagkeys-production-8b1a.up.railway.app/api/auth/discord/callback";

// 5. Redirect l Discord
app.get('/api/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

// 6. Callback (mli y-rje3 mn Discord)
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

        // Kan-rj3o l'site b l'data dyalou (bdel l'URL ila knti f hosting akhor)
        const userJson = JSON.stringify({ username: userData.global_name || userData.username, id: userData.id, avatar: userData.avatar });
        res.redirect(`https://4flag-webkeys.vercel.app/index.html?discord=${encodeURIComponent(userJson)}`);
    } catch (error) {
        res.status(500).send("Discord auth failed");
    }
});

// HNA KAN-KHDOU L'PORT LI RAILWAY KAY3TINA
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});