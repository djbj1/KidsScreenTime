# ⏱️ Architektur- & Designkonzept: ScreenTime Cockpit

Ein plattformunabhängiges, rein softwarebasiertes Heimserver-System zur spielerischen Verwaltung und Kontrolle der Bildschirmzeit von Kindern auf verschiedenen Geräten (z. B. PlayStation, Laptop, Tablet). Das System arbeitet autark ohne On-Device-Einschränkungen (wie Family Link) und bindet dedizierte IoT-Hardware per WLAN ein.

---

## 🏛️ 1. Systemarchitektur & Infrastruktur

Das System folgt einer strikten Trennung zwischen einer leichtgewichtigen Benutzeroberfläche (Vite Frontend), einer persistenten, relationalen Datenbankschicht (SQLite) und einem zentralen Steuer-Server (Node.js), der gleichzeitig als Web- und IoT-Server fungiert.

```mermaid
+---------------------------------------------------------------------------------+|                                 HEIMSERVER                                      ||                                                                                 ||  +--------------------+      +--------------------+      +-------------------+  ||  |    Express.js      |      |    Aedes MQTT      |      |   SQLite-DB       |  ||  | (HTTP Webserver)   |      |     (IoT Broker)   |      |  (screentime.db)  |  ||  +---------+----------+      +---------+----------+      +---------+---------+  ||            |                           |                           |            |+------------|---------------------------|---------------------------|------------+|                           |                           |REST API / JSON                MQTT / Wi-Fi               Internal SQL|                           |                           |v                           v                           v[ Vite.js Frontend ]        [ ESP Mikrocontroller ]       [ Daten-Persistenz ](Smartphones & Tablets)     (Mini-Display am Tisch)      (Historie & Konten)
```


### 🧱 Die Single-Server-Architektur (Node.js)
Um das System maximal wartungsarm und kompakt zu halten, übernimmt eine einzige Node.js-Instanz alle zentralen Server-Rollen. Es ist keine Installation von externer Zusatzsoftware (wie Docker oder ein separater Mosquitto-Broker) erforderlich. Der Server öffnet zwei Ports parallel:
1. **Port 3000 (HTTP/REST):** Liefert das Vite-Frontend aus und verarbeitet API-Anfragen der Smartphones.
2. **Port 1883 (MQTT via Aedes):** Verwaltet die dauerhafte, ressourcenschonende Funkverbindung zu den ESP-Hardware-Einheiten im Haus.

### 🗄️ Relationales Datenmodell (SQLite Schema)
Das Schema speichert Stammdaten, Kontostände und Revisionsdaten logisch getrennt und zukunftssicher:

*   **Benutzer (`users`):** `id`, `name`, `avatar_id`, `weekly_budget_minutes` (Das wöchentliche Basis-Zeitkontingent).
*   **Geräte (`devices`):** `id`, `name`, `type` (Konsole/Laptop), `esp_mac` (Die weltweit eindeutige Hardware-Kennung des zugeordneten ESP-Displays).
*   **Aktive Sitzungen (`active_sessions`):** `user_id`, `device_id`, `expires_at` (Unix-Timestamp des genauen Ablaufzeitpunkts).
*   **Das Sparbuch-Konto (`user_ledgers`):** `id`, `user_id`, `amount_minutes` (positiv für Gutschriften, negativ für Verbräuche), `type` ('allowance', 'rollover', 'bonus', 'usage'), `timestamp`.
*   **Das Audit-Log / Protokoll (`audit_logs`):** `id`, `timestamp`, `actor_role` ('parent', 'child', 'system'), `target_user_id`, `device_id`, `action_type`, `details` (JSON-Feld für granulare Metadaten).

### ⏱️ Die unbestechliche Eieruhr-Logik
Das System verlässt sich nicht auf flüchtige JavaScript-Timer (`setTimeout`) im Arbeitsspeicher, die bei einem Stromausfall oder Server-Neustart gelöscht würden:
1. **Berechnung:** Beim Starten einer Sitzung wird die Ziel-Uhrzeit berechnet: `Jetzt + X Minuten = Ablaufzeitstempel`. Dieser Timestamp wird sofort fest in `active_sessions` hinterlegt.
2. **Der Server-Wächter:** Ein Hintergrund-Prozess (Intervall) prüft alle 5 Sekunden, ob die aktuelle Uhrzeit den Ablaufstempel überschritten hat.
3. **Trigger:** Ist die Zeit abgelaufen, beendet der Server die Sitzung, bucht die Minuten im Ledger ab, setzt das Gerät auf "Gesperrt", generiert den Log-Eintrag und pusht das Alarmsignal simultan an alle beteiligten Geräte.

---

## 📡 2. IoT-Hardware-Integration via MAC-Adresse & MQTT

Jedem Kind bzw. jedem Schreibtisch-Arbeitsplatz wird eine kleine Hardware-Eieruhr beigestellt. Diese besteht aus einem günstigen Mikrocontroller (ESP8266 oder ESP32) und einem OLED/TFT-Display.

### 🛠️ Der "Zero-Configuration"-Anmelde-Workflow
Auf dem ESP läuft eine generische Firmware. Es müssen keine benutzerspezifischen Daten auf den Mikrocontroller geflasht werden. Die Zuordnung erfolgt komplett über die Hardware-MAC-Adresse des WLAN-Chips:

1. **Das Signal:** Beim Einschalten verbindet sich der ESP mit dem Heim-WLAN und schickt seine MAC-Adresse an das MQTT-Topic `esp/register`.
2. **Die Server-Prüfung:** Der Node.js-Server fängt das Topic ab und schaut in der SQLite-Tabelle `devices` nach dem Feld `esp_mac`.
   * *Bekanntes Gerät:* Der Server weiß sofort, zu welchem Kind und Gerät dieser ESP gehört.
   * *Unbekanntes Gerät:* Der Server listet die MAC-Adresse im Eltern-Dashboard unter „Neue Hardware gefunden“ auf, wo Eltern sie mit einem Klick benennen und einem Kind zuweisen können.
3. **Das gezielte Abonnement:** Der ESP abonniert anschließend vollautomatisch sein exklusives, gerätespezifisches Steuer-Topic: `device/[MAC-ADRESSE]/timer`.

### 🔄 Echtzeit-Datenfluss via MQTT-Push
Statt den Server durch permanentes REST-Polling im Sekundentakt zu belasten, nutzt der ESP das hocheffiziente MQTT-Protokoll. Der Node.js-Server pusht Änderungen sofort aktiv im JSON-Format an den ESP:

```json
{
  "status": "active",
  "remaining_seconds": 2700,
  "display_name": "Lukas",
  "end_time": "14:45"
)
```
*   **Verhalten bei Korrekturen:** Ändert der Vater am Smartphone die Zeit im laufenden Betrieb, sendet der Server ein neues JSON-Paket. Das Display des ESP springt in Echtzeit synchron um, ohne dass die Sitzung neu gestartet werden muss.

---

## 🕹️ 3. Bedienkonzept & User Experience (UX)

Die Anwendung ist als reaktive Single Page Application (SPA) konzipiert und konsequent für mobile Ansichten (Eltern-Smartphones) und Kinder-Geräte optimiert.

### A. Das „Sparbuch-Prinzip“ (Roll-Over-Budget)
Das System bricht mit starren Tageslimits und fördert die Eigenverantwortung der Kinder:
*   **Guthaben mitnehmen:** Unverbrauchte Minuten verfallen am Ende der Woche (Sonntag 23:59 Uhr) nicht. Das Node.js-Backend bilanziert die Woche und überträgt das Restguthaben als `rollover`-Eintrag auf den Montag der neuen Woche, wo es zum neuen Basis-Kontingent hinzuaddiert wird.
*   **Das Konto im Blick:** Vor dem Spielen sieht das Kind auf seinem Dashboard primär sein aktuelles "Gesamt-Sparguthaben" (z. B. *„Dein Guthaben: 245 Minuten“*). 
*   **Budget-Kappung (Harter Cut):** Reicht das verbleibende Wochenkontingent nicht mehr für die angeforderte Spielzeit aus (z. B. nur noch 12 Minuten Guthaben, aber 30 Minuten gewünscht), deckelt der Server die maximale Laufzeit der Sitzung automatisch auf die verbleibenden 12 Minuten.

### B. Das Eltern-Kontrollzentrum & Die Bank-Funktion
Eltern besitzen einen passwort- oder PIN-geschützten Bereich mit erweiterten Interventionsmöglichkeiten:
*   **Live-Korrektur:** Während eine Eieruhr läuft, können Eltern über Schnellwahlbuttons (`+15 Min` / `-15 Min`) direkt die aktuelle Laufzeit manipulieren.
*   **Manuelle Kontoführung:** Unabhängig von einer aktiven Spiel-Sitzung können Eltern wie eine Bank agieren und dem Kind direkt Minuten auf dem Sparbuch gutschreiben (z. B. *+30 Min Bonus für Zimmer aufräumen*) oder abziehen.

### C. Revisionssicheres Audit-Protokoll
Um Diskussionen im Familienalltag zu unterbinden, zeichnet das System jede Interaktion lückenlos auf und ordnet sie dem Verursacher zu:
*   *Szenario:* Vater stellt am eigenen Handy einen Timer für den Sohn.
*   *Protokoll-Eintrag:* `14:00 Uhr | 🛡️ Vater hat einen Timer für Lukas (PlayStation) gestartet (Dauer: 45 Min)`.
*   *Szenario:* Die Zeit läuft regulär ab und die Eieruhr stoppt.
*   *Protokoll-Eintrag:* `14:45 Uhr | 🔴 SYSTEM hat die Sitzung von Lukas (PlayStation) beendet. Grund: Zeit abgelaufen`.

---

## 🎨 4. UI/UX Design & Visuelle Sprache

Das Design orientiert sich an der minimalistischen Ästhetik nativer Smartphone-Uhr-Apps und nutzt ein flaches, kontrastreiches Kachellayout (Smart-Home-Zentralen-Stil).

### 🎨 Farbpalette & Signal-Zustände
*   **Hintergrund:** Sattes Anthrazit/Schwarz (Dark-Mode-Standard) zur optimalen Integration in Gaming-Umgebungen und Schonung der Augen am Abend.
*   **Statusfarben:**
    *   🔵 **Indigo-Blau:** Standardfarbe für aktive, entspannte Timer, Kontroll-Balken und Buttons.
    *   🟡 **Warn-Gelb:** Tritt automatisch in Kraft, wenn die Eieruhr die letzten 10 Minuten erreicht (Signalisiert dem Kind: *„Jetzt im Spiel abspeichern!“*).
    *   🔴 **Alarm-Rot:** Zeit abgelaufen, System-Sperre oder manueller Not-Aus.

### 🍱 Visuelle Komponenten im Vite-Frontend

#### 1. Die Live-Timer-Karte (Haupt-Dashboard)
Läuft ein Timer, dominiert das kreisförmige Eieruhr-Design das Display (analog zu nativen Smartphone-Timern):
*   **Zentrale Zeitanzeige:** Große, weiße, serifenlose Ziffern im Format `MM:SS` (z. B. `9:40`).
*   **Kreis-Animation:** Ein dünner, indigo-blauer Kreis umschließt die Zahlen und baut sich synchron im Uhrzeigersinn ab.
*   **Endzeit-Glocke:** Direkt unter den Zahlen zeigt ein dezentes Glocken-Symbol die reale End-Uhrzeit an (z. B. 🔔 `11:46`), um dem Kind die zeitliche Orientierung im echten Tagesablauf zu erleichtern.
*   **Aktionsknöpfe:** Darunter gelagerte, abgerundete Pillen-Buttons für `Abbrechen` und `Pause`.

#### 2. Der Aktivitäts-Feed & Kontoauszug (Eltern-Bereich)
*   **Timeline:** Chronologische Liste des Audit-Logs. Einträge, die von den *Eltern* ausgelöst wurden, tragen ein goldenes Schild-Icon (🛡️). Vom *Kind* ausgelöste Aktionen tragen eine blaue Spielfigur. Automatische *System-Aktionen* (Zeit abgelaufen) werden auffällig rot markiert.
*   **Finanz-Metapher:** Das Guthaben wird wie ein Bankkonto strukturiert aufgelistet (Eingänge in Grün mit Plus, Verbräuche in Weiß/Rot mit Minus).

#### 3. Das Hardware-Display (ESP)
*   Das kleine OLED/TFT-Display spiegelt das Smartphone-Design im Miniaturformat wider: Ein schlichter, geometrischer Kreis, der sich leert, sowie die Zeitanzeige im Zentrum. 
*   **Der visuelle Cut:** Bei Ablauf schaltet das Display in ein invertiertes Vollbild-Blinken um und gibt die personalisierte Namensmeldung aus: **„ZEIT UM, LUKAS!“**, während parallel ein angeschlossener Hardware-Buzzer piept.