import { registerPlugin, Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { logClientEvent } from './remoteLogger';

const ScreenTimeAlarm = registerPlugin('ScreenTimeAlarm');
const scheduledSessionsMap = new Map();

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function requestNotificationPermissions() {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        const res = await LocalNotifications.requestPermissions();
        logClientEvent('Notification-Permission', `Permissions status: ${res.display}`);
      }
    }
  } catch (e) {
    logClientEvent('Notification-Error', `Permission check error: ${e.message}`, null, 'WARN');
  }
}

export async function scheduleNativeTimerAlarm(sessionId, childName, deviceLabel, remainingSeconds) {
  try {
    if (!sessionId || remainingSeconds <= 0) return;

    const rawId = typeof sessionId === 'number' ? sessionId : hashCode(String(sessionId));
    const targetTimeMs = Math.floor(Date.now() + remainingSeconds * 1000);

    // Prevent cancelling and re-scheduling if already scheduled for roughly the same target time (+/- 3 seconds)
    const existingTarget = scheduledSessionsMap.get(sessionId);
    if (existingTarget && Math.abs(existingTarget - targetTimeMs) < 3000) {
      return;
    }

    // Cancel prior alarms for this session ID
    await cancelNativeTimerAlarm(sessionId);

    // 1. If running natively on Android, schedule exact AlarmClock with high-priority looping service
    if (Capacitor.isNativePlatform()) {
      try {
        await ScreenTimeAlarm.scheduleAlarm({
          sessionId: Number(rawId),
          childName: childName || 'Kind',
          deviceLabel: deviceLabel || 'Gerät',
          triggerAtMs: targetTimeMs
        });
        logClientEvent(
          'Native-AlarmClock-Scheduled',
          `Scheduled native AlarmManager.setAlarmClock for session #${sessionId} (${childName || 'Kind'})`,
          { targetTime: new Date(targetTimeMs).toISOString(), sessionId, remainingSeconds },
          'INFO',
          childName
        );
      } catch (nativeErr) {
        logClientEvent('Native-AlarmClock-Error', `Failed to schedule native alarm clock: ${nativeErr.message}`, { error: String(nativeErr) }, 'WARN', childName);
      }
    }

    // 2. Schedule LocalNotification as backup
    try {
      await requestNotificationPermissions();
      const baseId = (Math.abs(rawId) % 20000000) * 100;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: baseId,
            title: '🚨 ZEIT ABGELAUFEN!',
            body: `Achtung! Die Spielzeit für ${childName || 'das Kind'} (${deviceLabel || 'das Gerät'}) ist abgelaufen!`,
            schedule: { at: new Date(targetTimeMs), allowWhileIdle: true },
            channelId: 'screentime_alarm_clock_channel_v1',
            sound: 'alarm.wav',
            ongoing: true,
            autoCancel: false,
            actionTypeId: 'ALARM_ACTION',
            extra: { sessionId }
          }
        ]
      });
    } catch (lnErr) {
      // LocalNotification backup failure ignored if native alarm is armed
    }

    scheduledSessionsMap.set(sessionId, targetTimeMs);
  } catch (e) {
    logClientEvent('Notification-Error', `Could not schedule native timer alarm: ${e.message}`, { error: String(e) }, 'ERROR', childName);
  }
}

export async function clearAllDeliveredNotifications() {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.removeAllDeliveredNotifications().catch(() => {});
    }
  } catch (e) {
    console.warn('Could not remove delivered notifications:', e);
  }
}

export async function cancelNativeTimerAlarm(sessionId) {
  try {
    if (!sessionId) return;
    scheduledSessionsMap.delete(sessionId);

    const rawId = typeof sessionId === 'number' ? sessionId : hashCode(String(sessionId));
    const baseId = (Math.abs(rawId) % 20000000) * 100;

    // 1. Cancel native Android Alarm Clock & Stop ringing service
    if (Capacitor.isNativePlatform()) {
      try {
        await ScreenTimeAlarm.cancelAlarm({ sessionId: Number(rawId) });
      } catch (e) {}
    }

    // 2. Cancel scheduled LocalNotifications
    try {
      const notificationsToCancel = [{ id: baseId }, { id: Math.abs(rawId) }];
      for (let i = 0; i <= 10; i++) {
        notificationsToCancel.push({ id: baseId + i });
      }
      await LocalNotifications.cancel({ notifications: notificationsToCancel }).catch(() => {});
      await clearAllDeliveredNotifications();
    } catch (e) {}

    logClientEvent('Notification-Cancel', `Cancelled native alarm & notifications for session ${sessionId}`);
  } catch (e) {
    console.warn('Could not cancel native notification:', e);
  }
}

export async function stopNativeAlarm() {
  try {
    if (Capacitor.isNativePlatform()) {
      await ScreenTimeAlarm.stopActiveAlarm();
      await clearAllDeliveredNotifications();
      logClientEvent('Native-Alarm-Stop', 'Stopped native active alarm sound service');
    }
  } catch (e) {
    console.warn('Could not stop native alarm service:', e);
  }
}
