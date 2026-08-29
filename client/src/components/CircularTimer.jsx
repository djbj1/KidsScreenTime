import React, { useState, useEffect } from 'react';
import { playAlarmSound, stopAlarmSound } from '../utils/audioManager';
import { scheduleNativeTimerAlarm, cancelNativeTimerAlarm } from '../utils/nativeNotifications';
import { logClientEvent } from '../utils/remoteLogger';

export default function CircularTimer({
  childName,
  deviceLabel,
  secondsRemaining,
  totalDurationMinutes,
  isPaused,
  status,
  sessionId,
  expiresAt,
  onTogglePause,
  onCancel,
  onAcknowledge
}) {
  const isExpired = status === 'expired' || secondsRemaining <= 0;
  const [overtimeSec, setOvertimeSec] = useState(0);

  // Monitor Screen Lock / Visibility state (detects when user turns off screen)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const state = document.hidden ? 'LOCKED / BACKGROUND (document.hidden)' : 'UNLOCKED / FOREGROUND (document.visible)';
      logClientEvent('Screen-Visibility', `Screen state changed to: ${state}`, { isExpired, isPaused, childName }, 'INFO', childName);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isExpired, isPaused, childName]);

  // Live overtime calculation when session is expired
  useEffect(() => {
    if (!isExpired) {
      setOvertimeSec(0);
      return;
    }

    logClientEvent('Timer-Expired', `Timer expired for ${childName} on ${deviceLabel}!`, { sessionId, expiresAt }, 'WARN', childName);

    const calcOvertime = () => {
      if (expiresAt) {
        const nowSec = Math.floor(Date.now() / 1000);
        setOvertimeSec(Math.max(0, nowSec - expiresAt));
      } else {
        setOvertimeSec((prev) => prev + 1);
      }
    };

    calcOvertime();
    const interval = setInterval(calcOvertime, 1000);
    return () => clearInterval(interval);
  }, [isExpired, expiresAt, childName, deviceLabel]);

  // Screen Wake Lock API when timer is active
  useEffect(() => {
    let wakeLock = null;
    if (!isExpired && !isPaused) {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen')
          .then((lock) => { wakeLock = lock; })
          .catch(() => {});
      }
    }
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isExpired, isPaused]);

  // Audio Alarm, Physical Vibration & Text-To-Speech
  useEffect(() => {
    if (!isExpired) return;

    let vibrateInterval = null;
    let speechInterval = null;

    try {
      // 1. Play unlocked mobile HTML5 Audio stream
      playAlarmSound();

      // 2. Mobile Haptic Vibration
      if ('vibrate' in navigator) {
        const triggerVibration = () => {
          try {
            navigator.vibrate([500, 250, 500, 250, 500]);
          } catch (e) {}
        };
        triggerVibration();
        vibrateInterval = setInterval(triggerVibration, 3000);
      }

      // 3. Spoken Text-to-Speech (Web Speech API) using Child Name
      if ('speechSynthesis' in window) {
        const speakText = () => {
          try {
            window.speechSynthesis.cancel();
            const name = childName || 'Kind';
            const announcement = `Achtung ${name}! Deine Spielzeit ist abgelaufen. Bitte jetzt das Gerät beenden!`;
            const utterance = new SpeechSynthesisUtterance(announcement);
            utterance.lang = 'de-DE';
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.error('Speech synthesis error:', e);
          }
        };

        speakText();
        speechInterval = setInterval(speakText, 9000);
      }
    } catch (e) {
      console.error('Audio playback error:', e);
    }

    return () => {
      if (vibrateInterval) clearInterval(vibrateInterval);
      if (speechInterval) clearInterval(speechInterval);
      stopAlarmSound();
    };
  }, [isExpired, childName, deviceLabel]);

  // Desktop Notifications & Tab Title Blinking for background tabs
  useEffect(() => {
    if (!isExpired) return;

    // Request Notification permission if needed
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    // Trigger Desktop System Notification if granted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('🚨 ZEIT ABGELAUFEN!', {
          body: `Die Spielzeit für ${deviceLabel || 'das Gerät'} ist abgelaufen! Bitte quittieren.`,
          requireInteraction: true
        });
      } catch (e) {
        console.error('Notification error:', e);
      }
    }

    // Flash document title in tab bar
    const originalTitle = document.title;
    let toggle = false;
    const titleInterval = setInterval(() => {
      document.title = toggle ? '🚨 ZEIT ABGELAUFEN! 🚨' : '⏱️ ScreenTime Cockpit';
      toggle = !toggle;
    }, 800);

    return () => {
      clearInterval(titleInterval);
      document.title = originalTitle || 'ScreenTime Cockpit';
    };
  }, [isExpired, deviceLabel]);

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const digitsStr = isExpired
    ? '00:00'
    : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const targetDate = new Date(Date.now() + secondsRemaining * 1000);
  const endTimeStr = `${targetDate.getHours().toString().padStart(2, '0')}:${targetDate.getMinutes().toString().padStart(2, '0')}`;

  const maxSecs = (totalDurationMinutes || 30) * 60;
  const progressFraction = Math.min(1, Math.max(0, secondsRemaining / maxSecs));
  const circleOffset = isExpired ? 0 : 565 * (1 - progressFraction);

  let colorClass = '';
  if (isExpired) {
    colorClass = 'alarm';
  } else if (secondsRemaining <= 600) {
    colorClass = 'warning';
  }

  // Grace Period: 60 seconds (1 minute free reaction time)
  const isWithinGrace = overtimeSec <= 60;
  const remainingGraceSec = Math.max(0, 60 - overtimeSec);

  const overtimeAfterGrace = Math.max(0, overtimeSec - 60);
  const overtimeMins = Math.floor(overtimeAfterGrace / 60);
  const overtimeSecs = overtimeAfterGrace % 60;
  const overtimeStr = `+${overtimeMins.toString().padStart(2, '0')}:${overtimeSecs.toString().padStart(2, '0')}`;
  const billedOvertimeMins = Math.ceil(overtimeAfterGrace / 60);

  return (
    <div className="timer-section">
      <div className="timer-svg-container">
        <svg className="timer-svg" viewBox="0 0 200 200">
          <circle className="timer-circle-bg" cx="100" cy="100" r="90" />
          <circle
            className={`timer-circle-progress ${colorClass}`}
            cx="100"
            cy="100"
            r="90"
            style={{ strokeDashoffset: circleOffset }}
          />
        </svg>
        <div className="timer-content">
          <div className="timer-device-label">{deviceLabel || 'Gerät'}</div>
          <div className="timer-digits" style={{ color: isExpired ? 'var(--accent-red)' : '#fff' }}>
            {isExpired ? 'ZEIT UM!' : digitsStr}
          </div>
          <div className="timer-bell" style={{ background: isExpired ? 'rgba(239,68,68,0.25)' : undefined }}>
            {isExpired ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ color: '#fca5a5', fontWeight: 700 }}>🚨 Alarm aktiv!</span>
                {isWithinGrace ? (
                  <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 800, marginTop: '2px' }}>
                    🟢 Karenzzeit: noch {remainingGraceSec}s gratis
                  </span>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 800, marginTop: '2px' }}>
                    ⚠️ Überzeit: {overtimeStr} Min
                  </span>
                )}
              </div>
            ) : (
              <>🔔 Endzeit: <span style={{ fontWeight: 700 }}>{endTimeStr}</span></>
            )}
          </div>
        </div>
      </div>

      <div className="action-pills" style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}>
        {isExpired ? (
          <button
            className="pill-btn"
            style={{
              background: 'var(--accent-red)',
              color: '#fff',
              padding: '14px 24px',
              fontSize: '0.95rem',
              fontWeight: 800,
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
              animation: 'pulse 1.2s infinite',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px'
            }}
            onClick={onAcknowledge}
          >
            <span>🔔 Alarm beenden & Quittieren</span>
            {isWithinGrace ? (
              <span style={{ fontSize: '0.78rem', color: '#a7f3d0', fontWeight: 700 }}>
                (Pünktlich - 0 Min Abzug)
              </span>
            ) : (
              <span style={{ fontSize: '0.78rem', color: '#fef08a', fontWeight: 700 }}>
                ({billedOvertimeMins} Min Überzeit werden verbucht)
              </span>
            )}
          </button>
        ) : (
          <>
            <button className="pill-btn" onClick={onTogglePause}>
              <span>{isPaused ? '▶️' : '⏸️'}</span>
              <span>{isPaused ? 'Fortsetzen' : 'Pause'}</span>
            </button>
            <button className="pill-btn pill-btn-danger" onClick={onCancel}>
              🛑 Stoppen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
