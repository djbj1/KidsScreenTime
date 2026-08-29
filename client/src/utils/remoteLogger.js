// Remote Client Telemetry & Diagnostic Logger
// Sends mobile client events (Lockscreen, LocalNotifications, Audio playback) to server endpoint

export async function logClientEvent(category, message, details = null, level = 'INFO', childName = '') {
  try {
    const payload = {
      category,
      message,
      details,
      level,
      child_name: childName || localStorage.getItem('screentime_child_name') || '',
      device_info: navigator ? navigator.userAgent : ''
    };

    console.log(`[CLIENT-LOG] [${category}] ${message}`, details || '');

    // Asynchronously send to server (fire and forget)
    fetch('/api/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (e) {
    console.warn('Could not send client log:', e);
  }
}
