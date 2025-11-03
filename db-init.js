// db-init.js
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database('./data/db.sqlite');

function init() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      phone TEXT,
      password_hash TEXT,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT
    );
  `);

  // default roles
  const roles = ['admin','manager','user'];
  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)');
  roles.forEach(r => insertRole.run(r, `${r} role`));

  // default admin
  const adminUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if(!adminUser){
    const pass = 'admin123'; // поменяй пароль после первого входа!
    const hash = bcrypt.hashSync(pass, 10);
    const insertUser = db.prepare('INSERT INTO users (username, phone, password_hash, role) VALUES (?,?,?,?)');
    insertUser.run('admin', '+996000000000', hash, 'admin');
    console.log('Создан пользователь admin с паролем: admin123 (поменяйте сразу!)');
  } else {
    console.log('Admin уже существует');
  }

  console.log('Инициализация БД завершена.');
}

init();
db.close();
