// server.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const fs = require('fs');

const app = express();
const dbFile = path.join(__dirname, 'data', 'db.sqlite');
const dir = path.dirname(dbFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const dbExists = fs.existsSync(dbFile);
const db = new sqlite3.Database(dbFile);

// если база новая — создаем таблицы автоматически
if (!dbExists) {
  console.log('Создаётся новая база данных...');
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      phone TEXT,
      password_hash TEXT,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`);
    db.run(`CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT
    );`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
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
    db.run(`INSERT OR IGNORE INTO roles (name, description) VALUES ('admin', 'Administrator'), ('manager','Manager'), ('user','User');`);
    db.run(`INSERT OR IGNORE INTO settings (id, company_name, phone, email, currency, language, theme, address, description, logo_url)
      VALUES (1, 'ABU Cargo', '+996000000000', 'info@abucargo.example', 'KGS', 'ru', 'light', '', 'ABU Cargo service', '');`);
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, phone, password_hash, role) VALUES ('admin', '+996000000000', ?, 'admin');`, [hash]);
    console.log('База успешно создана (admin / admin123)');
  });
}
  // continue — init instruction shown. Render will fail unless db exists or init was run.


const db = new sqlite3.Database(dbFile);
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(methodOverride('_method'));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: './data' }),
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000 }
}));

// --- Helpers
async function loadSettings() {
  const s = await dbGet(`SELECT * FROM settings WHERE id = 1`);
  return s || {};
}

// middleware attach user & settings
app.use(async (req,res,next) => {
  res.locals.settings = await loadSettings();
  if (req.session.userId) {
    try {
      const u = await dbGet('SELECT id,username,role FROM users WHERE id = ?', [req.session.userId]);
      req.user = u || null;
      res.locals.currentUser = u || null;
    } catch(e) {
      req.user = null;
    }
  } else {
    req.user = null;
    res.locals.currentUser = null;
  }
  next();
});

function requireAuth(req,res,next){
  if(req.user) return next();
  res.redirect('/login');
}
function requireRole(role){
  return (req,res,next) => {
    if(!req.user) return res.status(403).send('Forbidden');
    if(req.user.role === role || req.user.role === 'admin') return next();
    res.status(403).send('Forbidden');
  };
}

// Routes

// index.html is served static for public; but route '/' redirect to /login per your choice
app.get('/', (req,res) => res.redirect('/login'));

// PUBLIC pages
app.get('/login', (req,res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req,res) => {
  const { username, password } = req.body;
  if(!username || !password) return res.render('login', { error: 'Введите логин и пароль' });
  try {
    const row = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if(!row) return res.render('login', { error: 'Пользователь не найден' });
    if(!bcrypt.compareSync(password, row.password_hash)) return res.render('login', { error: 'Неправильный пароль' });
    req.session.userId = row.id;
    res.redirect('/dashboard');
  } catch(e) {
    res.render('login', { error: 'Ошибка входа' });
  }
});

app.get('/register', (req,res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req,res) => {
  const { username, phone, password } = req.body;
  if(!username || !password) return res.render('register', { error: 'Заполните все поля' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    await dbRun('INSERT INTO users (username, phone, password_hash, role) VALUES (?,?,?,?)', [username, phone || '', hash, 'user']);
    res.redirect('/login');
  } catch(e) {
    res.render('register', { error: 'Ошибка регистрации: '+ (e.message || '') });
  }
});

app.post('/logout', (req,res) => {
  req.session.destroy(()=> res.redirect('/login'));
});

// Dashboard
app.get('/dashboard', requireAuth, (req,res) => {
  res.render('dashboard', { user: req.user });
});

// Users management
app.get('/dashboard/users', requireAuth, async (req,res) => {
  const users = await dbAll('SELECT id,username,phone,role,created_at FROM users ORDER BY id DESC');
  const roles = (await dbAll('SELECT name FROM roles')).map(r=>r.name);
  res.render('users', { users, roles, user: req.user });
});

app.get('/dashboard/users/new', requireAuth, requireRole('manager'), async (req,res) => {
  const roles = (await dbAll('SELECT name FROM roles')).map(r=>r.name);
  res.render('user-edit', { target: null, roles, user: req.user });
});
app.post('/dashboard/users', requireAuth, requireRole('manager'), async (req,res) => {
  const { username, phone, password, role } = req.body;
  const hash = bcrypt.hashSync(password || '123456', 10);
  try {
    await dbRun('INSERT INTO users (username, phone, password_hash, role) VALUES (?,?,?,?)', [username, phone||'', hash, role || 'user']);
    res.redirect('/dashboard/users');
  } catch(e) {
    res.status(400).send('Ошибка: '+e.message);
  }
});
app.get('/dashboard/users/:id/edit', requireAuth, requireRole('manager'), async (req,res) => {
  const id = Number(req.params.id);
  const target = await dbGet('SELECT id,username,phone,role FROM users WHERE id = ?', [id]);
  if(!target) return res.status(404).send('Не найден');
  const roles = (await dbAll('SELECT name FROM roles')).map(r=>r.name);
  res.render('user-edit', { target, roles, user: req.user });
});
app.post('/dashboard/users/:id', requireAuth, requireRole('manager'), async (req,res) => {
  const id = Number(req.params.id);
  const { username, phone, password, role } = req.body;
  try {
    if(password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10);
      await dbRun('UPDATE users SET username=?, phone=?, password_hash=?, role=? WHERE id=?', [username, phone||'', hash, role, id]);
    } else {
      await dbRun('UPDATE users SET username=?, phone=?, role=? WHERE id=?', [username, phone||'', role, id]);
    }
    res.redirect('/dashboard/users');
  } catch(e) {
    res.status(400).send('Ошибка: '+e.message);
  }
});
app.post('/dashboard/users/:id/delete', requireAuth, requireRole('admin'), async (req,res) => {
  const id = Number(req.params.id);
  await dbRun('DELETE FROM users WHERE id = ?', [id]);
  res.redirect('/dashboard/users');
});

// Roles
app.get('/roles', requireAuth, requireRole('admin'), async (req,res) => {
  const roles = await dbAll('SELECT * FROM roles ORDER BY id');
  res.render('roles', { roles, user: req.user });
});
app.post('/roles', requireAuth, requireRole('admin'), async (req,res) => {
  const { name, description } = req.body;
  try {
    await dbRun('INSERT INTO roles (name, description) VALUES (?,?)', [name, description || '']);
    res.redirect('/roles');
  } catch(e) {
    res.status(400).send('Ошибка: '+e.message);
  }
});
app.post('/roles/:id/delete', requireAuth, requireRole('admin'), async (req,res) => {
  const id = Number(req.params.id);
  await dbRun('DELETE FROM roles WHERE id = ?', [id]);
  res.redirect('/roles');
});

// Settings (admin only)
app.get('/dashboard/settings', requireAuth, requireRole('admin'), async (req,res) => {
  const s = await dbGet('SELECT * FROM settings WHERE id = 1');
  res.render('settings', { settings: s || {}, user: req.user, message: null });
});
app.post('/dashboard/settings', requireAuth, requireRole('admin'), async (req,res) => {
  const { company_name, phone, email, currency, language, theme, address, description, logo_url } = req.body;
  try {
    await dbRun(`UPDATE settings SET company_name=?, phone=?, email=?, currency=?, language=?, theme=?, address=?, description=?, logo_url=? WHERE id=1`,
      [company_name||'', phone||'', email||'', currency||'', language||'', theme||'light', address||'', description||'', logo_url||'']);
    const s = await dbGet('SELECT * FROM settings WHERE id = 1');
    res.render('settings', { settings: s || {}, user: req.user, message: 'Сохранено' });
  } catch(e) {
    res.status(400).send('Ошибка: '+e.message);
  }
});

// Fallback
app.use((req,res) => res.status(404).send('Not found'));

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
