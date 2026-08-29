import express from 'express';
import { queryAll, queryOne, runSql } from '../db.js';
import { getUserBalance, getUserDetailedBalance, getWeeklySummary, editDayTime } from '../budget.js';
import { addClient, broadcastEvent } from '../events.js';

const router = express.Router();

// 0. Realtime Server-Sent Events (SSE) stream for mobile background sync and dashboard live updates
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('event: connected\ndata: {"status":"connected"}\n\n');
  addClient(res);
});

// 1. PIN verification for Parent Control Center
router.post('/auth/pin', (req, res) => {
  const { pin } = req.body;
  if (pin === '1307') {
    return res.json({ success: true, message: 'PIN korrekt' });
  } else {
    return res.status(401).json({ success: false, message: 'Falsche PIN!' });
  }
});

// 2. Get all users with current balance (including weeklyBalance & bonusBalance)
router.get('/users', async (req, res) => {
  try {
    const users = await queryAll(`SELECT * FROM users ORDER BY id ASC`);
    const usersWithBalance = await Promise.all(
      users.map(async (u) => {
        const detailed = await getUserDetailedBalance(u.id);
        return { ...u, ...detailed, balance: detailed.totalBalance };
      })
    );
    res.json(usersWithBalance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Create or update user
router.post('/users', async (req, res) => {
  try {
    const { id, name, avatar_id, weekly_budget_minutes } = req.body;
    if (id) {
      await runSql(
        `UPDATE users SET name = ?, avatar_id = ?, weekly_budget_minutes = ? WHERE id = ?`,
        [name, avatar_id || '👦', weekly_budget_minutes || 300, id]
      );
      return res.json({ success: true, message: 'Benutzer aktualisiert' });
    } else {
      const result = await runSql(
        `INSERT INTO users (name, avatar_id, weekly_budget_minutes) VALUES (?, ?, ?)`,
        [name, avatar_id || '👦', weekly_budget_minutes || 300]
      );
      const newUserId = result.lastID;
      const nowSec = Math.floor(Date.now() / 1000);
      const dateStr = new Date().toISOString().split('T')[0];
      await runSql(
        `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) VALUES (?, ?, 'allowance', ?, ?, 'Wochenbudget Erstansatz')`,
        [newUserId, weekly_budget_minutes || 300, nowSec, dateStr]
      );
      return res.json({ success: true, id: newUserId, message: 'Neuer Benutzer angelegt' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = await queryOne(`SELECT name FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    await runSql(`DELETE FROM users WHERE id = ?`, [userId]);
    await runSql(`DELETE FROM active_sessions WHERE user_id = ?`, [userId]);
    await runSql(`DELETE FROM user_ledgers WHERE user_id = ?`, [userId]);
    await runSql(`UPDATE devices SET assigned_user_id = NULL WHERE assigned_user_id = ?`, [userId]);

    await runSql(
      `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, 'parent', ?, NULL, 'delete_user', ?)`,
      [nowSec, userId, JSON.stringify({ message: `🛡️ Eltern haben Kind ${user.name} gelöscht.` })]
    );

    res.json({ success: true, message: `Kind ${user.name} wurde gelöscht.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Tabular Weekly Summary for user (Montag-Sonntag, newest day first)
router.get('/users/:id/weekly-summary', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const weekOffset = parseInt(req.query.weekOffset, 10) || 0;
    const summary = await getWeeklySummary(userId, weekOffset);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Parent Inline Day Time & Device Correction
router.post('/users/:id/weekly-summary/edit', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { dateStr, newMinutes, newDeviceName, weekOffset } = req.body;
    if (!dateStr || newMinutes === undefined) {
      return res.status(400).json({ error: 'dateStr und newMinutes sind erforderlich' });
    }
    const updatedSummary = await editDayTime(userId, dateStr, parseInt(newMinutes, 10), newDeviceName, 'parent', weekOffset || 0);
    res.json({ success: true, summary: updatedSummary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Get all devices
router.get('/devices', async (req, res) => {
  try {
    const devices = await queryAll(`
      SELECT d.*, u.name as assigned_user_name 
      FROM devices d 
      LEFT JOIN users u ON d.assigned_user_id = u.id 
      ORDER BY d.id ASC
    `);
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Create or update device
router.post('/devices', async (req, res) => {
  try {
    const { id, name, type, assigned_user_id } = req.body;
    if (id) {
      await runSql(
        `UPDATE devices SET name = ?, type = ?, assigned_user_id = ? WHERE id = ?`,
        [name, type || 'Konsole', assigned_user_id || null, id]
      );
      res.json({ success: true, message: 'Gerät aktualisiert' });
    } else {
      const result = await runSql(
        `INSERT INTO devices (name, type, assigned_user_id) VALUES (?, ?, ?)`,
        [name, type || 'Konsole', assigned_user_id || null]
      );
      res.json({ success: true, id: result.lastID, message: 'Neues Gerät angelegt' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch all display smartphones running the app
router.get('/display-clients', async (req, res) => {
  try {
    const clients = await queryAll(`
      SELECT c.*, u.name as assigned_user_name 
      FROM display_clients c 
      LEFT JOIN users u ON c.assigned_user_id = u.id 
      ORDER BY c.id ASC
    `);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register or heartbeat from display smartphone client
router.post('/display-clients/register', async (req, res) => {
  try {
    const { client_uuid, client_name, client_info } = req.body;
    if (!client_uuid) {
      return res.status(400).json({ error: 'client_uuid ist erforderlich' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const existing = await queryOne(`SELECT * FROM display_clients WHERE client_uuid = ?`, [client_uuid]);

    if (existing) {
      const updatedName = (client_name && client_name !== 'Neues Anzeige-Smartphone' && client_name !== 'Android Smartphone (Anzeige)' && client_name !== 'Web Client (Anzeige)' && (existing.client_name.includes('(Anzeige)') || existing.client_name.includes('Neues')))
        ? client_name
        : existing.client_name;

      await runSql(
        `UPDATE display_clients SET last_seen = ?, client_info = ?, client_name = ? WHERE id = ?`,
        [nowSec, client_info || '', updatedName, existing.id]
      );

      const assignedUser = existing.assigned_user_id
        ? await queryOne(`SELECT name FROM users WHERE id = ?`, [existing.assigned_user_id])
        : null;

      return res.json({
        success: true,
        client: {
          ...existing,
          client_name: updatedName,
          last_seen: nowSec,
          assigned_user_name: assignedUser ? assignedUser.name : null
        }
      });
    } else {
      const name = client_name || 'Neues Anzeige-Smartphone';
      const result = await runSql(
        `INSERT INTO display_clients (client_uuid, client_name, last_seen, client_info) VALUES (?, ?, ?, ?)`,
        [client_uuid, name, nowSec, client_info || '']
      );

      await runSql(
        `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, 'system', NULL, NULL, 'register_display_client', ?)`,
        [
          nowSec,
          JSON.stringify({ message: `📱 Neues Anzeige-Smartphone "${name}" hat sich am Server gemeldet.` })
        ]
      );

      return res.json({
        success: true,
        client: {
          id: result.lastID,
          client_uuid,
          client_name: name,
          assigned_user_id: null,
          assigned_user_name: null,
          last_seen: nowSec
        }
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename display client (custom label like "Galaxy A52" or "Wohnzimmer Display")
router.post('/display-clients/rename', async (req, res) => {
  try {
    const { id, client_name } = req.body;
    if (!id || !client_name) {
      return res.status(400).json({ error: 'id und client_name sind erforderlich' });
    }
    await runSql(`UPDATE display_clients SET client_name = ? WHERE id = ?`, [client_name, id]);
    res.json({ success: true, message: 'Gerätename aktualisiert' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Central parent display smartphone assignment
router.post('/display-clients/assign', async (req, res) => {
  try {
    const { client_id, assigned_user_id } = req.body;
    const client = await queryOne(`SELECT * FROM display_clients WHERE id = ?`, [client_id]);
    if (!client) {
      return res.status(404).json({ error: 'Anzeige-Gerät nicht gefunden' });
    }

    const userId = assigned_user_id ? parseInt(assigned_user_id, 10) : null;
    await runSql(`UPDATE display_clients SET assigned_user_id = ? WHERE id = ?`, [userId, client_id]);

    const targetUser = userId ? await queryOne(`SELECT name FROM users WHERE id = ?`, [userId]) : null;
    const nowSec = Math.floor(Date.now() / 1000);
    const logMsg = targetUser
      ? `🛡️ Eltern haben Anzeige-Handy "${client.client_name}" dem Kind ${targetUser.name} zugewiesen.`
      : `🛡️ Eltern haben Anzeige-Handy "${client.client_name}" freigestellt (Hauptansicht).`;

    await runSql(
      `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, 'parent', ?, NULL, 'assign_display_client', ?)`,
      [nowSec, userId, JSON.stringify({ message: logMsg })]
    );

    res.json({ success: true, message: logMsg, assigned_user_name: targetUser ? targetUser.name : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete display client
router.delete('/display-clients/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await runSql(`DELETE FROM display_clients WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Anzeige-Gerät gelöscht' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register or heartbeat from smartphone client
router.post('/devices/register', async (req, res) => {
  try {
    const { device_uuid, name, type, client_info } = req.body;
    if (!device_uuid) {
      return res.status(400).json({ error: 'device_uuid ist erforderlich' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const existing = await queryOne(`SELECT * FROM devices WHERE device_uuid = ?`, [device_uuid]);

    if (existing) {
      await runSql(
        `UPDATE devices SET last_seen = ?, client_info = ? WHERE id = ?`,
        [nowSec, client_info || '', existing.id]
      );

      const assignedUser = existing.assigned_user_id
        ? await queryOne(`SELECT name FROM users WHERE id = ?`, [existing.assigned_user_id])
        : null;

      return res.json({
        success: true,
        device: {
          ...existing,
          last_seen: nowSec,
          assigned_user_name: assignedUser ? assignedUser.name : null
        }
      });
    } else {
      const devName = name || 'Neues Smartphone';
      const devType = type || 'Smartphone';
      const result = await runSql(
        `INSERT INTO devices (name, type, device_uuid, last_seen, client_info) VALUES (?, ?, ?, ?, ?)`,
        [devName, devType, device_uuid, nowSec, client_info || '']
      );

      await runSql(
        `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, 'system', NULL, ?, 'register_device', ?)`,
        [
          nowSec,
          result.lastID,
          JSON.stringify({ message: `📱 Neues Gerät "${devName}" hat sich am Server gemeldet.` })
        ]
      );

      return res.json({
        success: true,
        device: {
          id: result.lastID,
          name: devName,
          type: devType,
          device_uuid,
          assigned_user_id: null,
          assigned_user_name: null,
          is_locked: 0,
          last_seen: nowSec
        }
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Central parent device assignment
router.post('/devices/assign', async (req, res) => {
  try {
    const { device_id, assigned_user_id } = req.body;
    const device = await queryOne(`SELECT * FROM devices WHERE id = ?`, [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Gerät nicht gefunden' });
    }

    const userId = assigned_user_id ? parseInt(assigned_user_id, 10) : null;
    await runSql(`UPDATE devices SET assigned_user_id = ? WHERE id = ?`, [userId, device_id]);

    const targetUser = userId ? await queryOne(`SELECT name FROM users WHERE id = ?`, [userId]) : null;
    const nowSec = Math.floor(Date.now() / 1000);
    const logMsg = targetUser
      ? `🛡️ Eltern haben Gerät "${device.name}" dem Kind ${targetUser.name} zugewiesen.`
      : `🛡️ Eltern haben Gerät "${device.name}" freigestellt (unzugewiesen).`;

    await runSql(
      `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, 'parent', ?, ?, 'assign_device', ?)`,
      [nowSec, userId, device_id, JSON.stringify({ message: logMsg })]
    );

    res.json({ success: true, message: logMsg, assigned_user_name: targetUser ? targetUser.name : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Get current active or expired-alarm session(s)
router.get('/sessions/active', async (req, res) => {
  try {
    const { user_id, device_id, all } = req.query;
    let sql = `
      SELECT s.*, u.name as user_name, u.avatar_id as user_avatar, d.name as device_name 
      FROM active_sessions s 
      JOIN users u ON s.user_id = u.id 
      JOIN devices d ON s.device_id = d.id 
      WHERE s.status IN ('active', 'paused', 'expired')
    `;
    const params = [];
    if (user_id) {
      sql += ` AND s.user_id = ?`;
      params.push(user_id);
    }
    if (device_id) {
      sql += ` AND s.device_id = ?`;
      params.push(device_id);
    }
    sql += ` ORDER BY s.id DESC`;

    const sessions = await queryAll(sql, params);
    const nowSec = Math.floor(Date.now() / 1000);

    const formattedSessions = sessions.map((session) => {
      let remainingSeconds = 0;
      if (session.status === 'active') {
        remainingSeconds = Math.max(0, session.expires_at - nowSec);
      } else if (session.status === 'paused') {
        remainingSeconds = session.remaining_seconds_at_pause;
      } else {
        remainingSeconds = 0;
      }
      return {
        ...session,
        remaining_seconds: remainingSeconds
      };
    });

    if (all === 'true' || (!user_id && !device_id)) {
      return res.json(formattedSessions);
    }

    if (formattedSessions.length === 0) {
      return res.json({ active: false });
    }

    res.json({
      active: true,
      session: formattedSessions[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6b. Toggle device lock state
router.post('/devices/toggle-lock', async (req, res) => {
  try {
    const { device_id } = req.body;
    const device = await queryOne(`SELECT * FROM devices WHERE id = ?`, [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Gerät nicht gefunden' });
    }

    const newLockState = device.is_locked ? 0 : 1;
    await runSql(`UPDATE devices SET is_locked = ? WHERE id = ?`, [newLockState, device_id]);

    const nowSec = Math.floor(Date.now() / 1000);
    const actionLabel = newLockState ? 'gesperrt' : 'freigegeben';
    await runSql(
      `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, 'parent', ?, ?, 'toggle_device_lock', ?)`,
      [
        nowSec,
        device.user_id,
        device_id,
        JSON.stringify({ message: `🛡️ Eltern haben das Gerät "${device.name}" manuell ${actionLabel}.` })
      ]
    );

    res.json({
      success: true,
      is_locked: newLockState,
      message: `Gerät "${device.name}" ${actionLabel}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Acknowledge expired session alarm with 1:1 overtime deduction
router.post('/sessions/acknowledge', async (req, res) => {
  try {
    const { session_id, actor_role } = req.body;
    const session = await queryOne(
      `SELECT s.*, u.name as user_name, d.name as device_name FROM active_sessions s JOIN users u ON s.user_id = u.id JOIN devices d ON s.device_id = d.id WHERE s.id = ? AND s.status = 'expired'`,
      [session_id]
    );

    if (!session) {
      return res.json({ success: true, message: 'Sitzung bereits quittiert' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    await runSql(`UPDATE active_sessions SET status = 'acknowledged' WHERE id = ?`, [session_id]);

    // Calculate overtime in minutes with 1 min (60s) free grace period
    const rawOvertimeSeconds = Math.max(0, nowSec - session.expires_at);
    const overtimeSeconds = Math.max(0, rawOvertimeSeconds - 60);
    const overtimeMinutes = Math.ceil(overtimeSeconds / 60);

    const dateStr = new Date(nowSec * 1000).toISOString().split('T')[0];

    if (overtimeMinutes > 0) {
      // Book overtime usage in ledger
      await runSql(
        `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) VALUES (?, ?, 'usage', ?, ?, ?)`,
        [session.user_id, -overtimeMinutes, nowSec, dateStr, `${session.device_name} Überzeit`]
      );
    }

    const roleLabel = actor_role === 'parent' ? '🛡️ Eltern' : '👤 Kind';
    const logMsg = overtimeMinutes > 0
      ? `${roleLabel} hat den Alarm für ${session.user_name} (${session.device_name}) nach ${overtimeMinutes} Min Überzeit (nach 1 Min Karenzzeit) quittiert (-${overtimeMinutes} Min verbucht).`
      : `${roleLabel} hat den Alarm für ${session.user_name} (${session.device_name}) innerhalb der 1 Min Karenzzeit quittiert.`;

    await runSql(
      `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, ?, ?, ?, 'acknowledge_alarm', ?)`,
      [
        nowSec,
        actor_role || 'child',
        session.user_id,
        session.device_id,
        JSON.stringify({
          overtime_minutes: overtimeMinutes,
          message: logMsg
        })
      ]
    );

    res.json({
      success: true,
      overtimeMinutes,
      message: overtimeMinutes > 0
        ? `Alarm quittiert (${overtimeMinutes} Min Überzeit abgebucht)`
        : 'Alarm pünktlich quittiert'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Start a new session with Budget Cap (Harter Cut)
router.post('/sessions/start', async (req, res) => {
  try {
    const { user_id, device_id, requested_minutes, actor_role } = req.body;
    const requestedMins = parseInt(requested_minutes, 10);

    // Check if device is locked
    const device = await queryOne(`SELECT * FROM devices WHERE id = ?`, [device_id]);
    if (!device) {
      return res.status(404).json({ error: 'Gerät nicht gefunden' });
    }

    // Check balance & perform hard cut if necessary
    const detailed = await getUserDetailedBalance(user_id);
    const currentBalance = detailed.totalBalance;
    if (currentBalance <= 0) {
      return res.status(400).json({ error: 'Kein Sparguthaben vorhanden! Bitte aufladen.' });
    }

    // Hard Budget Cut
    const actualMins = Math.min(requestedMins, currentBalance);
    const wasCapped = actualMins < requestedMins;

    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + actualMins * 60;

    // Create active session
    const result = await runSql(
      `INSERT INTO active_sessions (user_id, device_id, expires_at, started_at, duration_minutes, status) 
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [user_id, device_id, expiresAt, nowSec, actualMins]
    );

    // Unlock device if locked
    await runSql(`UPDATE devices SET is_locked = 0 WHERE id = ?`, [device_id]);

    // User & Device details for Audit Log
    const user = await queryOne(`SELECT name FROM users WHERE id = ?`, [user_id]);
    const roleLabel = actor_role === 'parent' ? '🛡️ Vater/Mutter' : '👤 ' + (user ? user.name : 'Kind');

    const details = JSON.stringify({
      requested_minutes: requestedMins,
      actual_minutes: actualMins,
      was_capped: wasCapped,
      message: `${roleLabel} hat einen Timer für ${user ? user.name : ''} (${device.name}) gestartet (Dauer: ${actualMins} Min${wasCapped ? ' - Auf Guthaben gedeckelt' : ''}).`
    });

    await runSql(
      `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) 
       VALUES (?, ?, ?, ?, 'start_session', ?)`,
      [nowSec, actor_role || 'child', user_id, device_id, details]
    );

    broadcastEvent('session_start', {
      sessionId: result.lastID,
      userId: user_id,
      userName: user ? user.name : 'Kind',
      deviceId: device_id,
      deviceName: device.name,
      durationMinutes: actualMins,
      remainingSeconds: actualMins * 60,
      expiresAt
    });

    res.json({
      success: true,
      sessionId: result.lastID,
      durationMinutes: actualMins,
      wasCapped,
      message: wasCapped
        ? `Sitzung auf das verbleibende Guthaben von ${actualMins} Min gedeckelt!`
        : `Sitzung gestartet (${actualMins} Min).`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Pause session
router.post('/sessions/pause', async (req, res) => {
  try {
    const { session_id } = req.body;
    const session = await queryOne(`SELECT * FROM active_sessions WHERE id = ? AND status = 'active'`, [session_id]);
    if (!session) {
      return res.status(404).json({ error: 'Keine aktive Sitzung gefunden' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const remainingSec = Math.max(0, session.expires_at - nowSec);

    await runSql(
      `UPDATE active_sessions SET status = 'paused', remaining_seconds_at_pause = ? WHERE id = ?`,
      [remainingSec, session_id]
    );

    broadcastEvent('session_pause', { sessionId: session_id });

    res.json({ success: true, message: 'Sitzung pausiert', remainingSeconds: remainingSec });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Resume session
router.post('/sessions/resume', async (req, res) => {
  try {
    const { session_id } = req.body;
    const session = await queryOne(`SELECT * FROM active_sessions WHERE id = ? AND status = 'paused'`, [session_id]);
    if (!session) {
      return res.status(404).json({ error: 'Keine pausierte Sitzung gefunden' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const newExpiresAt = nowSec + session.remaining_seconds_at_pause;

    await runSql(
      `UPDATE active_sessions SET status = 'active', expires_at = ?, remaining_seconds_at_pause = 0 WHERE id = ?`,
      [newExpiresAt, session_id]
    );

    broadcastEvent('session_resume', {
      sessionId: session_id,
      expiresAt: newExpiresAt,
      remainingSeconds: session.remaining_seconds_at_pause
    });

    res.json({ success: true, message: 'Sitzung fortgesetzt', expiresAt: newExpiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Cancel session early
router.post('/sessions/cancel', async (req, res) => {
  try {
    const { session_id, actor_role } = req.body;
    const session = await queryOne(
      `SELECT s.*, u.name as user_name, d.name as device_name FROM active_sessions s JOIN users u ON s.user_id = u.id JOIN devices d ON s.device_id = d.id WHERE s.id = ? AND s.status IN ('active', 'paused')`,
      [session_id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Keine laufende Sitzung zum Beenden gefunden' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    let usedSeconds = 0;

    if (session.status === 'active') {
      usedSeconds = Math.max(0, nowSec - session.started_at);
    } else {
      usedSeconds = session.duration_minutes * 60 - session.remaining_seconds_at_pause;
    }

    const usedMinutes = Math.max(1, Math.ceil(usedSeconds / 60));

    // Update session status
    await runSql(`UPDATE active_sessions SET status = 'cancelled' WHERE id = ?`, [session_id]);

    // Book used minutes in ledger
    const dateStr = new Date(nowSec * 1000).toISOString().split('T')[0];
    await runSql(
      `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) VALUES (?, ?, ?, ?, ?, ?)`,
      [session.user_id, -usedMinutes, 'usage', nowSec, dateStr, `${session.device_name} Vorzeitiger Stopp`]
    );

    // Audit log
    const roleLabel = actor_role === 'parent' ? '🛡️ Eltern' : '👤 Kind';
    await runSql(
      `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, ?, ?, ?, 'cancel_session', ?)`,
      [
        nowSec,
        actor_role || 'child',
        session.user_id,
        session.device_id,
        JSON.stringify({
          used_minutes: usedMinutes,
          message: `${roleLabel} hat die Sitzung von ${session.user_name} (${session.device_name}) vorzeitig gestoppt (${usedMinutes} Min verbucht).`
        })
      ]
    );

    broadcastEvent('session_cancel', { sessionId: session_id });

    res.json({ success: true, usedMinutes, message: `Sitzung gestoppt (${usedMinutes} Min verbucht).` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Bank Transactions (Bonus / Debit / Override by Parent)
router.post('/ledger/transaction', async (req, res) => {
  try {
    const { user_id, amount_minutes, target_bonus_minutes, note } = req.body;
    const nowSec = Math.floor(Date.now() / 1000);
    const dateStr = new Date(nowSec * 1000).toISOString().split('T')[0];

    let amount = 0;
    const user = await queryOne(`SELECT name FROM users WHERE id = ?`, [user_id]);
    const currentDetailed = await getUserDetailedBalance(user_id);

    if (target_bonus_minutes !== undefined && target_bonus_minutes !== null && target_bonus_minutes !== '') {
      const targetBonus = Math.max(0, parseInt(target_bonus_minutes, 10) || 0);
      amount = targetBonus - currentDetailed.bonusBalance;
    } else {
      amount = parseInt(amount_minutes, 10) || 0;
    }

    if (amount !== 0) {
      const type = 'bonus';
      await runSql(
        `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) VALUES (?, ?, ?, ?, ?, ?)`,
        [user_id, amount, type, nowSec, dateStr, note || (amount >= 0 ? 'Bonus Gutschrift' : 'Bonus Korrektur')]
      );

      const logText = amount >= 0
        ? `🛡️ Eltern haben für ${user ? user.name : ''} +${amount} Min Bonus gewährt (${note || 'Bonus-Anpassung'}).`
        : `🛡️ Eltern haben für ${user ? user.name : ''} ${amount} Min Bonus korrigiert (${note || 'Bonus-Anpassung'}).`;

      await runSql(
        `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, 'parent', ?, NULL, 'bank_transaction', ?)`,
        [nowSec, user_id, JSON.stringify({ amount_minutes: amount, note, message: logText })]
      );
    }

    const newDetailed = await getUserDetailedBalance(user_id);
    res.json({
      success: true,
      ...newDetailed,
      message: 'Bonus-Guthaben erfolgreich angepasst'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Get Audit Logs
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await queryAll(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50`);
    const parsedLogs = logs.map((l) => {
      let detailsObj = {};
      try {
        detailsObj = JSON.parse(l.details);
      } catch (e) {
        detailsObj = { message: l.details };
      }
      return {
        ...l,
        detailsObj
      };
    });
    res.json(parsedLogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Client Remote Telemetry Logging (Mobile / Lockscreen Diagnostics)
router.post('/client-logs', async (req, res) => {
  try {
    const { category, message, details, level, child_name, device_info } = req.body;
    const nowSec = Math.floor(Date.now() / 1000);
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || '');

    await runSql(
      `INSERT INTO client_logs (timestamp, device_info, child_name, log_level, category, message, details) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nowSec,
        device_info || req.headers['user-agent'] || 'Mobile Client',
        child_name || 'Unbekannt',
        level || 'INFO',
        category || 'CLIENT',
        message || '',
        detailsStr
      ]
    );

    console.log(`📱 [CLIENT-LOG] [${category}] ${child_name ? '(' + child_name + ') ' : ''}${message}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/client-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const logs = await queryAll(`SELECT * FROM client_logs ORDER BY id DESC LIMIT ?`, [limit]);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/client-logs', async (req, res) => {
  try {
    await runSql(`DELETE FROM client_logs`);
    res.json({ success: true, message: 'Client logs cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
