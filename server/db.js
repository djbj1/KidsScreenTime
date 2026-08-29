import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../screentime.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Helper for running SQL statements with Promises
export const runSql = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// Helper for fetching all rows with Promises
export const queryAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Helper for fetching a single row with Promises
export const queryOne = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const initDb = async () => {
  // 1. Users table
  await runSql(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_id TEXT DEFAULT '👦',
      weekly_budget_minutes INTEGER DEFAULT 300,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Devices table
  await runSql(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      assigned_user_id INTEGER,
      is_locked INTEGER DEFAULT 0,
      device_uuid TEXT UNIQUE,
      last_seen INTEGER,
      client_info TEXT,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  try { await runSql(`ALTER TABLE devices ADD COLUMN device_uuid TEXT`); } catch (e) {}
  try { await runSql(`ALTER TABLE devices ADD COLUMN last_seen INTEGER`); } catch (e) {}
  try { await runSql(`ALTER TABLE devices ADD COLUMN client_info TEXT`); } catch (e) {}

  // 3. Active Sessions table
  await runSql(`
    CREATE TABLE IF NOT EXISTS active_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      remaining_seconds_at_pause INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )
  `);

  // 4. User Ledgers table (Savings account)
  await runSql(`
    CREATE TABLE IF NOT EXISTS user_ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_minutes INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      date_str TEXT NOT NULL,
      note TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 5. Display Clients table (Smartphones displaying the app)
  await runSql(`
    CREATE TABLE IF NOT EXISTS display_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_uuid TEXT UNIQUE NOT NULL,
      client_name TEXT NOT NULL,
      assigned_user_id INTEGER,
      last_seen INTEGER,
      client_info TEXT,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 5. Audit Logs table
  await runSql(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      actor_role TEXT NOT NULL,
      target_user_id INTEGER,
      device_id INTEGER,
      action_type TEXT NOT NULL,
      details TEXT NOT NULL
    )
  `);

  // 6. Client Logs table (Remote Smartphone Telemetry & Lockscreen Diagnostics)
  await runSql(`
    CREATE TABLE IF NOT EXISTS client_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      device_info TEXT,
      child_name TEXT,
      log_level TEXT DEFAULT 'INFO',
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT
    )
  `);

  // If users table is empty, ensure at least 1 customizable child exists ("Kind 1")
  const userCount = await queryOne(`SELECT COUNT(*) as count FROM users`);
  if (userCount.count === 0) {
    console.log('Creating initial customizable child user ("Kind 1")...');
    const res = await runSql(`INSERT INTO users (name, avatar_id, weekly_budget_minutes) VALUES ('Kind 1', '👦', 300)`);
    const childId = res.lastID;

    // Default Device
    await runSql(`INSERT INTO devices (name, type, assigned_user_id) VALUES ('PlayStation 5', 'Konsole', ?)`, [childId]);

    // Initial Allowance
    const nowSec = Math.floor(Date.now() / 1000);
    const dateStr = new Date().toISOString().split('T')[0];
    await runSql(
      `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) VALUES (?, 300, 'allowance', ?, ?, 'Wochenbudget Erstansatz')`,
      [childId, nowSec, dateStr]
    );
  }
};

export default db;
