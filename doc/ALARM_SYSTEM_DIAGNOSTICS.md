# Alarm- & Benachrichtigungssystem: Dokumentation & Sammelstörungs-Architektur

## 1. Architektur-Übersicht: Echtes Android-Uhr-Timer-System & Audio-Fokus-Trennung

Das ScreenTime Cockpit behandelt Alarme auf dem Eltern-Smartphone nach dem Prinzip des **nativen Android-Uhr-Timers / Weckers**:

- **Keine Beeinträchtigung anderer Medien (YouTube / Spotify)**:
  - Während der Timer eingestellt wird oder der Countdown läuft, wird **kein stummer Audio-Stream mehr abgespielt**.
  - YouTube, Spotify und andere Medien behalten zu 100% ihre normale Lautstärke (kein Audio-Ducking vor Alarm-Eintritt).
  - Der Android-Audio-Fokus wird erst in der Sekunde angefordert, in der der Wecker/Alarm tatsächlich auslöst.

- **Natives Android AlarmClock-System (`AlarmManager.setAlarmClock`)**:
  - Nutzt `AlarmManager.setAlarmClock()`, das höchstpriorisierte Android-System-API für Wecker und Timer.
  - Völlig immun gegen Android Doze Mode, Akku-Optimierung und Background-Task-Einschränkungen.
  - Das Smartphone weckt sich bei Ablauf der Spielzeit selbstständig aus dem Tiefschlaf auf.

- **Kontinuierlicher Endlosschleifen-Alarm (`AlarmSoundService`)**:
  - Sobald die Zeit abläuft, startet der native Foreground-Service `AlarmSoundService`.
  - Spielt `alarm.wav` in einer **Endlosschleife** (`MediaPlayer.setLooping(true)`) mit `AudioAttributes.USAGE_ALARM` und Vibration ab.
  - Während der Alarm klingelt, wird YouTube automatisch heruntergepegelt.
  - Die Benachrichtigung bietet einen direkten Button **"🛑 ALARM STOPPEN"** und öffnet beim Antippen die ScreenTime-App.
  - Beim Klick auf "Alarm stoppen" oder Quittieren in der App wird der Ton sofort beendet, der Audio-Fokus freigegeben und YouTube kehrt auf Normalpegel zurück.

---

## 2. Zentrale Komponenten

- **[`client/src/utils/nativeNotifications.js`](file:///root/ScreenTimeOrga/client/src/utils/nativeNotifications.js)**: Übergabe an den nativen AlarmClock-Service.
- **[`android/.../ScreenTimeAlarmPlugin.java`](file:///root/ScreenTimeOrga/android/app/src/main/java/de/familie/screentime/ScreenTimeAlarmPlugin.java)**: Capacitor-Plugin für `setAlarmClock`, `cancelAlarm` und `stopActiveAlarm`.
- **[`android/.../AlarmReceiver.java`](file:///root/ScreenTimeOrga/android/app/src/main/java/de/familie/screentime/AlarmReceiver.java)**: Broadcast-Receiver mit WakeLock.
- **[`android/.../AlarmSoundService.java`](file:///root/ScreenTimeOrga/android/app/src/main/java/de/familie/screentime/AlarmSoundService.java)**: Foreground-Service für Endlosschleifen-Alarm (`USAGE_ALARM`), Vibration und Heads-Up Notification.
- **[`client/src/utils/audioManager.js`](file:///root/ScreenTimeOrga/client/src/utils/audioManager.js)**: Saubere Audioverwaltung ohne Hintergrund-Ducking bei Countdown.
- **[`client/src/components/CircularTimer.jsx`](file:///root/ScreenTimeOrga/client/src/components/CircularTimer.jsx)**: UI-Timer mit Quittierungs- und Pausen-Logik.
- **[`client/src/App.jsx`](file:///root/ScreenTimeOrga/client/src/App.jsx)**: Zentrale Sammelstörungs-Überwachung aller Sitzungen.
