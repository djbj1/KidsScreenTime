import { queryAll, queryOne, runSql } from './db.js';
import { getUserBalance, getUserDetailedBalance, toLocalDateStr } from './budget.js';
import { broadcastEvent } from './events.js';

let watchdogInterval = null;

export const checkWeeklyBudgetReset = async () => {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);
    const mondayStr = toLocalDateStr(monday);
    const nowSec = Math.floor(now.getTime() / 1000);

    const users = await queryAll(`SELECT * FROM users`);
    for (const user of users) {
      // Check if an allowance/reset entry already exists for this Monday
      const existingAllowance = await queryOne(
        `SELECT * FROM user_ledgers WHERE user_id = ? AND date_str = ? AND type = 'allowance'`,
        [user.id, mondayStr]
      );

      if (!existingAllowance) {
        const targetBudget = user.weekly_budget_minutes || 180;

        // 1. Calculate unplayed minutes from the previous week (-1 weekOffset)
        const prevWeekDetailed = await getUserDetailedBalance(user.id, -1);
        const leftoverMinutes = Math.max(0, prevWeekDetailed.weeklyBalance);

        // 2. If leftoverMinutes > 0, credit them as bonus in user_ledgers
        if (leftoverMinutes > 0) {
          await runSql(
            `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) VALUES (?, ?, 'bonus', ?, ?, ?)`,
            [user.id, leftoverMinutes, nowSec, mondayStr, `Restguthaben-Übertrag Vorwoche (${leftoverMinutes} Min)`]
          );
        }

        // 3. Insert 'allowance' marker entry for this Monday
        await runSql(
          `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) VALUES (?, 0, 'allowance', ?, ?, ?)`,
          [user.id, nowSec, mondayStr, `Wochenbudget Start ${mondayStr}`]
        );

        const details = JSON.stringify({
          mondayStr,
          targetBudget,
          leftoverMinutes,
          message: `🔄 SYSTEM: Neue Woche (${mondayStr}) gestartet. ${leftoverMinutes > 0 ? `${leftoverMinutes} Min Restguthaben als Bonus übertragen. ` : ''}Frische ${targetBudget} Min Wochenguthaben stehen bereit.`
        });

        await runSql(
          `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, 'system', ?, NULL, 'weekly_reset', ?)`,
          [nowSec, user.id, details]
        );

        console.log(`🔄 Monday Budget Reset logged for ${user.name}: new week ${mondayStr} active (${targetBudget} Min budget, ${leftoverMinutes} Min bonus rollover).`);
      }
    }
  } catch (err) {
    console.error('Error in checkWeeklyBudgetReset:', err);
  }
};

export const startWatchdog = () => {
  if (watchdogInterval) return;

  console.log('⏱️ Server Watchdog started (checking active sessions every 5 seconds)...');

  // Perform initial check on boot
  checkWeeklyBudgetReset();

  watchdogInterval = setInterval(async () => {
    try {
      await checkWeeklyBudgetReset();

      const nowSec = Math.floor(Date.now() / 1000);

      // Find all active sessions where expires_at <= current timestamp
      const expiredSessions = await queryAll(
        `SELECT s.*, u.name as user_name, d.name as device_name 
         FROM active_sessions s 
         JOIN users u ON s.user_id = u.id 
         JOIN devices d ON s.device_id = d.id 
         WHERE s.status = 'active' AND s.expires_at <= ?`,
        [nowSec]
      );

      for (const session of expiredSessions) {
        console.log(`🔴 WATCHDOG EXPIRED SESSION #${session.id}: User ${session.user_name} on ${session.device_name}`);

        // 1. Mark session as expired
        await runSql(`UPDATE active_sessions SET status = 'expired' WHERE id = ?`, [session.id]);

        // 2. Book usage in ledger (negative minutes)
        const dateStr = new Date(nowSec * 1000).toISOString().split('T')[0];
        await runSql(
          `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [session.user_id, -session.duration_minutes, 'usage', nowSec, dateStr, `${session.device_name} Nutzung`]
        );

        // 3. Lock device
        await runSql(`UPDATE devices SET is_locked = 1 WHERE id = ?`, [session.device_id]);

        // 4. Create Audit Log
        const details = JSON.stringify({
          reason: 'Zeit abgelaufen',
          duration_minutes: session.duration_minutes,
          message: `🔴 SYSTEM hat die Sitzung von ${session.user_name} (${session.device_name}) beendet. Grund: Zeit abgelaufen.`
        });

        await runSql(
          `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) 
           VALUES (?, 'system', ?, ?, 'session_expired', ?)`,
          [nowSec, session.user_id, session.device_id, details]
        );

        broadcastEvent('session_expired', {
          sessionId: session.id,
          userId: session.user_id,
          userName: session.user_name,
          deviceId: session.device_id,
          deviceName: session.device_name
        });
      }
    } catch (err) {
      console.error('Error in Watchdog loop:', err);
    }
  }, 5000);
};

export const stopWatchdog = () => {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
    console.log('⏱️ Server Watchdog stopped.');
  }
};
