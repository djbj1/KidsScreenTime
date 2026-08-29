# ScreenTime Background Sync Wächter-Service

Dieses Dokument beschreibt die Funktionsweise der Echtzeit-Hintergrund-Synchronisation zwischen Server (z. B. Notebook / Raspberry Pi) und dem Smartphone (Android APK) bei gesperrtem Bildschirm sowie die Schritte zur vollständigen Deaktivierung bzw. Entfernung.

---

## 1. Warum wurde der Background-Sync Service eingeführt?

### Das Ausgangsproblem
Wenn ein Timer auf dem **Notebook** gestartet wurde, während das **Smartphone** mit gesperrtem Bildschirm im Standby lag:
- Android / Mobile Browser frieren im Sperrzustand sämtliche JavaScript-Schleifen (`setInterval`, `fetchData`) ein, um Akku zu sparen.
- Das Smartphone erfuhr daher nichts vom Timer-Start und konnte den Android-Systemwecker (`AlarmManager.setAlarmClock`) nicht scharfschalten.

### Die Lösung
Ein leichtgewichtiger **Android Foreground Service** (`BackgroundSyncService.java`):
1. Hält eine stromsparende Server-Sent Events (SSE) Verbindung zu `http://192.168.178.227:3000/api/events` offen.
2. Empfängt Timer-Ereignisse (`session_start`, `session_pause`, `session_resume`, `session_cancel`, `session_expired`) in Echtzeit (< 50 ms) – auch wenn das Smartphone gesperrt ist.
3. Stellt bei jedem Start/Resume sofort den nativen Systemwecker (`AlarmManager.setAlarmClock()`).

---

## 2. Beteiligte Dateien & Komponenten

| Komponente | Datei | Beschreibung |
| :--- | :--- | :--- |
| **Server Hub** | `server/events.js` | Verwaltet offene SSE-Client-Streams und sendet Broadcast-Events. |
| **Server API** | `server/routes/api.js` | Stellt `GET /api/events` bereit und triggert Broadcasts bei Session-Änderungen. |
| **Server Watchdog** | `server/watchdog.js` | Triggert `session_expired` Broadcasts bei automatischem Ablauf. |
| **Android Service** | `android/app/src/main/java/de/familie/screentime/BackgroundSyncService.java` | Empfängt SSE-Events im Hintergrund und steuert den `AlarmManager`. |
| **Android Manifest** | `android/app/src/main/AndroidManifest.xml` | Deklariert den Service und die `FOREGROUND_SERVICE_DATA_SYNC` Berechtigung. |
| **Android Activity** | `android/app/src/main/java/de/familie/screentime/MainActivity.java` | Startet den Background-Service beim App-Start. |

---

## 3. Wie man den Service wieder deaktiviert / entfernt (Rollback-Anleitung)

Falls der Hintergrund-Dienst jemals wieder entfernt oder deaktiviert werden soll, führe folgende 3 Schritte aus:

### Schritt 1: Android Start & Registrierung entfernen
1. **`android/app/src/main/java/de/familie/screentime/MainActivity.java`**:
   Entferne den Aufruf `ContextCompat.startForegroundService(this, syncIntent);` aus der `onCreate()`-Methode.
2. **`android/app/src/main/AndroidManifest.xml`**:
   Entferne den Eintrag `<service android:name=".BackgroundSyncService" ... />`.
3. **Datei löschen**:
   Lösche die Datei `android/app/src/main/java/de/familie/screentime/BackgroundSyncService.java`.

### Schritt 2: Server-Broadcasts zurückbauen (Optional)
1. In `server/routes/api.js`: Die Zeilen `import { addClient, broadcastEvent }` und die Aufrufe von `broadcastEvent(...)` entfernen.
2. Die Datei `server/events.js` löschen.

### Schritt 3: APK neu kompilieren
Führe das Build-Skript aus:
```bash
./build-apk.sh
```
Die neu generierte APK unter `http://192.168.178.227:3000/screentime.apk` enthält den Hintergrunddienst danach nicht mehr.

