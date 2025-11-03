// db-init.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');

const dbFile = path.join(__dirname, 'data', 'db.sqlite');
const dir = path.dirname(dbFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new sqlite3.Database(dbFile);
const run = promisify(db.run.bind(db));
const get = promisify(db.get.bind(db));

async function init() {
  try {
    await run(`PRAGMA journal_mode = WAL;`);

    await run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      phone TEXT,
      password_hash TEXT,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`);

    await run(`CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT
    );`);

    await run(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT,
      phone TEXT,
      email TEXT,
      currency TEXT,
      language TEXT,
      theme TEXT,
      address TEXT,
      description TEXT,
      logo_url TEXT
    );`);

    // default roles
    const roles = ['admin', 'manager', 'user'];
    for (const r of roles) {
      await run(`INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)`, [r, `${r} role`]);
    }

    // default settings row (id = 1)
    await run(`INSERT OR IGNORE INTO settings (id, company_name, phone, email, currency, language, theme, address, description, logo_url)
      VALUES (1, 'ABU Cargo', '+996000000000', 'info@abucargo.example', 'KGS', 'ru', 'light', '', 'ABU Cargo service', '')`);

    // default admin
    const admin = await get(`SELECT * FROM users WHERE username = ?`, ['admin']);
    if (!admin) {
      const pass = 'admin123';
      const hash = bcrypt.hashSync(pass, 10);
      await run(`INSERT INTO users (username, phone, password_hash, role) VALUES (?,?,?,?)`, ['admin', '+996000000000', hash, 'admin']);
      console.log('Created admin: admin / admin123 — change the password immediately!');
    } else {
      console.log('Admin exists');
    }

    console.log('DB initialized.');
  } catch (err) {
    console.error('DB init error:', err);
  } finally {
    db.close();
  }
}

init();
