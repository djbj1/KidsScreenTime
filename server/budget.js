import { queryAll, queryOne, runSql } from './db.js';

// Format Date as local YYYY-MM-DD
export const toLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Calculate current total balance for a user from user_ledgers
export const getUserBalance = async (userId) => {
  const result = await queryOne(
    `SELECT SUM(amount_minutes) as total FROM user_ledgers WHERE user_id = ?`,
    [userId]
  );
  return result && result.total !== null ? result.total : 0;
};

// Calculate detailed balances for a user (totalBalance, weeklyBalance, bonusBalance, weekUsed)
export const getUserDetailedBalance = async (userId, weekOffset = 0) => {
  const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [userId]);
  if (!user) {
    return { totalBalance: 0, weeklyBalance: 0, bonusBalance: 0, weekUsed: 0, weeklyBudget: 0 };
  }

  const weeklyBudget = user.weekly_budget_minutes || 180;

  // 1. Calculate usage for the selected week
  const { days: selectedDays } = getCurrentWeekDates(weekOffset);
  const selectedDateStrs = selectedDays.map((d) => d.dateStr);

  let weekUsed = 0;
  if (selectedDateStrs.length > 0) {
    const placeholders = selectedDateStrs.map(() => '?').join(',');
    const entries = await queryAll(
      `SELECT amount_minutes, type FROM user_ledgers WHERE user_id = ? AND date_str IN (${placeholders})`,
      [userId, ...selectedDateStrs]
    );
    for (const entry of entries) {
      if (entry.type === 'usage') {
        weekUsed += Math.abs(entry.amount_minutes);
      } else if (entry.type === 'day_correction' || (entry.type === 'correction' && entry.note && entry.note.includes('Eltern-Korrektur'))) {
        weekUsed -= entry.amount_minutes;
      }
    }
  }
  weekUsed = Math.max(0, weekUsed);
  const weeklyBalance = Math.max(0, weeklyBudget - weekUsed);

  // 2. Calculate bonus balance strictly from 'bonus' ledger entries
  const bonusResult = await queryOne(
    `SELECT SUM(amount_minutes) as bonusTotal FROM user_ledgers WHERE user_id = ? AND type = 'bonus'`,
    [userId]
  );
  const bonusBalance = Math.max(0, bonusResult && bonusResult.bonusTotal !== null ? bonusResult.bonusTotal : 0);

  // 3. Total balance is total available minutes
  const totalBalance = weeklyBalance + bonusBalance;

  return {
    totalBalance,
    weeklyBalance,
    bonusBalance,
    weekUsed,
    weeklyBudget
  };
};

// Calculate ISO week number
export const getISOWeekNumber = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
};

// Calculate Monday to Sunday dates for week with weekOffset (0 = current week, -1 = last week, etc.)
export const getCurrentWeekDates = (weekOffset = 0) => {
  const now = new Date();
  const offsetNum = parseInt(weekOffset, 10) || 0;
  now.setDate(now.getDate() + offsetNum * 7);

  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const kwNumber = getISOWeekNumber(monday);
  const kwYear = monday.getFullYear();

  const days = [];
  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const todayStr = toLocalDateStr(new Date());

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toLocalDateStr(d);
    const isToday = dateStr === todayStr;

    days.push({
      dayName: dayNames[i],
      dateStr,
      displayDate: `${dayNames[i]} ${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.`,
      isToday,
      timestamp: Math.floor(d.getTime() / 1000)
    });
  }

  const mondayFormatted = `${monday.getDate().toString().padStart(2, '0')}.${(monday.getMonth() + 1).toString().padStart(2, '0')}.`;
  const sundayFormatted = `${sunday.getDate().toString().padStart(2, '0')}.${(sunday.getMonth() + 1).toString().padStart(2, '0')}.${sunday.getFullYear()}`;

  return {
    days: days.reverse(),
    kwNumber,
    kwYear,
    kwLabel: `KW ${kwNumber} (${mondayFormatted} - ${sundayFormatted})`
  };
};

// Helper to filter out system notes from device column
const cleanDeviceName = (note) => {
  if (!note) return null;
  if (
    note.includes('Wochenbudget') ||
    note.includes('Eltern-Korrektur') ||
    note.includes('Bonus') ||
    note.includes('Abzug') ||
    note.includes('Korrektur')
  ) {
    return null;
  }
  return note.replace(/ Nutzung$/i, '').replace(/ Vorzeitiger Stopp$/i, '').trim();
};

// Fetch weekly tabular summary (Wann & Wieviel) for a user
export const getWeeklySummary = async (userId, weekOffset = 0) => {
  const offsetNum = parseInt(weekOffset, 10) || 0;
  const { days: weekDays, kwNumber, kwYear, kwLabel } = getCurrentWeekDates(offsetNum);
  const detailed = await getUserDetailedBalance(userId, offsetNum);
  const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [userId]);

  const summaryRows = [];
  let totalWeekUsed = 0;

  for (const day of weekDays) {
    // Get ledgers for this specific date
    const ledgers = await queryAll(
      `SELECT * FROM user_ledgers WHERE user_id = ? AND date_str = ? ORDER BY id ASC`,
      [userId, day.dateStr]
    );

    let dayUsedMinutes = 0;
    let deviceNames = [];

    for (const entry of ledgers) {
      if (entry.type === 'usage') {
        dayUsedMinutes += Math.abs(entry.amount_minutes);
      } else if (entry.type === 'day_correction' || (entry.type === 'correction' && entry.note && entry.note.includes('Eltern-Korrektur'))) {
        dayUsedMinutes -= entry.amount_minutes;
      }

      const cleanDev = cleanDeviceName(entry.note);
      if (cleanDev && !deviceNames.includes(cleanDev)) {
        deviceNames.push(cleanDev);
      }
    }

    dayUsedMinutes = Math.max(0, dayUsedMinutes);
    totalWeekUsed += dayUsedMinutes;

    let status = 'Spielfrei';
    let statusColor = 'gray';

    // Check if there is an active session right now for this user
    const activeSession = await queryOne(
      `SELECT s.*, d.name as device_name FROM active_sessions s JOIN devices d ON s.device_id = d.id WHERE s.user_id = ? AND s.status = 'active'`,
      [userId]
    );

    if (day.isToday && activeSession) {
      status = 'Aktiv';
      statusColor = 'blue';
      if (!deviceNames.includes(activeSession.device_name)) {
        deviceNames.unshift(activeSession.device_name);
      }
    } else if (dayUsedMinutes > 0) {
      status = 'Verbraucht';
      statusColor = 'green';
    }

    summaryRows.push({
      dateStr: day.dateStr,
      dayName: day.dayName,
      displayDate: day.displayDate + (day.isToday ? ' (Heute)' : ''),
      isToday: day.isToday,
      device: deviceNames.length > 0 ? deviceNames.join(', ') : '-',
      minutes: dayUsedMinutes,
      status,
      statusColor
    });
  }

  return {
    userId,
    userName: user ? user.name : '',
    totalBalance: detailed.totalBalance,
    weeklyBalance: detailed.weeklyBalance,
    bonusBalance: detailed.bonusBalance,
    weeklyBudget: user ? user.weekly_budget_minutes : 180,
    totalWeekUsed,
    weekOffset: offsetNum,
    kwNumber,
    kwYear,
    kwLabel,
    rows: summaryRows
  };
};

// Edit / Override recorded minutes and device for a specific day by a parent
export const editDayTime = async (userId, dateStr, newMinutes, newDeviceName, actorRole = 'parent', weekOffset = 0) => {
  const targetMinutes = Math.max(0, parseInt(newMinutes, 10) || 0);
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. Delete ALL previous usage and correction entries for this user and date
  await runSql(
    `DELETE FROM user_ledgers WHERE user_id = ? AND date_str = ? AND type IN ('usage', 'correction', 'day_correction')`,
    [userId, dateStr]
  );

  // 2. If targetMinutes > 0, insert exactly 1 clean base usage entry
  if (targetMinutes > 0) {
    const deviceNote = newDeviceName && newDeviceName !== '-' ? `${newDeviceName} Nutzung` : 'Spielzeit';
    await runSql(
      `INSERT INTO user_ledgers (user_id, amount_minutes, type, timestamp, date_str, note) VALUES (?, ?, 'usage', ?, ?, ?)`,
      [userId, -targetMinutes, nowSec, dateStr, deviceNote]
    );
  }

  // Record audit log
  await runSql(
    `INSERT INTO audit_logs (timestamp, actor_role, target_user_id, device_id, action_type, details) VALUES (?, ?, ?, NULL, 'correction', ?)`,
    [
      nowSec,
      actorRole,
      userId,
      JSON.stringify({
        dateStr,
        newMinutes: targetMinutes,
        newDeviceName: newDeviceName || '-',
        message: `🛡️ Eltern haben für ${dateStr} Gerät (${newDeviceName || '-'}) und Zeit (${targetMinutes} Min) korrigiert.`
      })
    ]
  );

  return await getWeeklySummary(userId, weekOffset);
};
