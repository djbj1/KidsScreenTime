// Global Mobile Audio Manager (Clean audio management without background ducking)
import { logClientEvent } from './remoteLogger';
import { stopNativeAlarm } from './nativeNotifications';

let globalAudio = null;
let isPlayingAlarm = false;

export function unlockAudio() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch (e) {
    logClientEvent('Audio-Error', `unlockAudio exception: ${e.message}`, null, 'ERROR');
  }
}

// No-op keep-alive to ensure background media apps (like YouTube) are never ducked during countdown
export function startKeepAlive() {
  // Intentionally empty: No silent audio stream should run while setting/counting timer
}

export function playAlarmSound() {
  try {
    isPlayingAlarm = true;
    logClientEvent('Audio-Alarm-Trigger', 'playAlarmSound() called - starting alarm playback');

    if (!globalAudio) {
      globalAudio = new Audio('/alarm.wav');
    } else {
      globalAudio.pause();
      globalAudio.src = '/alarm.wav';
    }

    globalAudio.loop = true;
    globalAudio.volume = 1.0;

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '🚨 ZEIT ABGELAUFEN!',
          artist: 'ScreenTime Cockpit',
          album: 'Timer Alarm'
        });
      } catch (e) {}
    }

    const playPromise = globalAudio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          logClientEvent('Audio-Alarm-Playing', 'Alarm audio is playing in loop');
        })
        .catch((err) => {
          logClientEvent('Audio-Alarm-Blocked', `Alarm audio playback blocked by browser: ${err.message}`, { error: String(err) }, 'WARN');
        });
    }
  } catch (e) {
    logClientEvent('Audio-Error', `playAlarmSound exception: ${e.message}`, null, 'ERROR');
  }
}

export function stopAlarmSound() {
  try {
    isPlayingAlarm = false;
    logClientEvent('Audio-Alarm-Stop', 'stopAlarmSound() called - releasing audio focus');

    // 1. Stop Web HTML5 audio completely and release audio focus
    if (globalAudio) {
      globalAudio.pause();
      globalAudio.currentTime = 0;
      globalAudio.removeAttribute('src');
      globalAudio.load();
      globalAudio = null;
    }

    // 2. Cancel any SpeechSynthesis speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // 3. Stop Native Android Alarm Service if running
    stopNativeAlarm().catch(() => {});
  } catch (e) {
    logClientEvent('Audio-Error', `stopAlarmSound exception: ${e.message}`, null, 'ERROR');
  }
}
