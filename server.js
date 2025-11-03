// server.js
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('./data/db.sqlite');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(methodOverride('_method'));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: './data' }),
  secret: 'change_this_secret', // поменяй на свой
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000 }
}));

// --- Middleware: auth & role check ---
function requireAuth(req, res, next){
  if(req.session.userId){
    const user = db.prepare('SELECT id,username,role FROM users WHERE id = ?').get(req.session.userId);
    if(user){ req.user = user; return next(); }
  }
  res.redirect('/login');
}

function requireRole(role){
  return (req,res,next) => {
    if(req.user && req.user.role === role) return next();
    // также разрешаем admin всегда
    if(req.user && req.user.role === 'admin') return next();
    res.status(403).send('Forbidden — нет прав');
  };
}

// --- Routes ---
app.get('/', (req,res)=> res.redirect('/dashboard'));

app.get('/login', (req,res) => {
  res.render('login', { error: null });
});

app.post('/login', (req,res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if(!row) return res.render('login', { error: 'Пользователь не найден' });
  if(!bcrypt.compareSync(password, row.password_hash)) return res.render('login', { error: 'Неправильный пароль' });
  req.session.userId = row.id;
  res.redirect('/dashboard');
});

app.post('/logout', (req,res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/dashboard', requireAuth, (req,res) => {
  res.render('dashboard', { user: req.user });
});

// --- Users management (admin or manager) ---
app.get('/dashboard/users', requireAuth, (req,res) => {
  const users = db.prepare('SELECT id,username,phone,role,created_at FROM users ORDER BY id DESC').all();
  const roles = db.prepare('SELECT name FROM roles').all().map(r=>r.name);
  res.render('users', { user: req.user, users, roles });
});

app.get('/dashboard/users/new', requireAuth, requireRole('manager'), (req,res) => {
  const roles = db.prepare('SELECT name FROM roles').all().map(r=>r.name);
  res.render('user-edit', { user: req.user, target: null, roles });
});

app.post('/dashboard/users', requireAuth, requireRole('manager'), (req,res) => {
  const { username, phone, password, role } = req.body;
  const hash = bcrypt.hashSync(password || '123456', 10);
  try{
    db.prepare('INSERT INTO users (username, phone, password_hash, role) VALUES (?,?,?,?)').run(username, phone, hash, role);
    res.redirect('/dashboard/users');
  }catch(e){
    res.status(400).send('Ошибка создания: '+e.message);
  }
});

app.get('/dashboard/users/:id/edit', requireAuth, requireRole('manager'), (req,res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT id,username,phone,role FROM users WHERE id = ?').get(id);
  if(!target) return res.status(404).send('Не найден');
  const roles = db.prepare('SELECT name FROM roles').all().map(r=>r.name);
  res.render('user-edit', { user: req.user, target, roles });
});

app.post('/dashboard/users/:id', requireAuth, requireRole('manager'), (req,res) => {
  const id = Number(req.params.id);
  const { username, phone, password, role } = req.body;
  if(password && password.trim() !== ''){
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET username=?, phone=?, password_hash=?, role=? WHERE id=?').run(username, phone, hash, role, id);
  } else {
    db.prepare('UPDATE users SET username=?, phone=?, role=? WHERE id=?').run(username, phone, role, id);
  }
  res.redirect('/dashboard/users');
});

app.post('/dashboard/users/:id/delete', requireAuth, requireRole('admin'), (req,res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.redirect('/dashboard/users');
});

// --- Roles management (admin only) ---
app.get('/roles', requireAuth, requireRole('admin'), (req,res) => {
  const roles = db.prepare('SELECT * FROM roles').all();
  res.render('roles', { user: req.user, roles });
});

app.post('/roles', requireAuth, requireRole('admin'), (req,res) => {
  const { name, description } = req.body;
  try{
    db.prepare('INSERT INTO roles (name, description) VALUES (?,?)').run(name, description);
    res.redirect('/roles');
  }catch(e){
    res.status(400).send('Ошибка создания роли: '+e.message);
  }
});

app.post('/roles/:id/delete', requireAuth, requireRole('admin'), (req,res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM roles WHERE id=?').run(id);
  res.redirect('/roles');
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
