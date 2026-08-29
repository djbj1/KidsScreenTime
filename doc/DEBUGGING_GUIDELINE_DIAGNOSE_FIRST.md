# Leitfaden: Diagnose-First & Evidenzbasiertes Debugging

## 1. Philosophie & Grundsatz

Bei der Weiterentwicklung und Fehlerbehebung gilt das Prinzip: **"Zuerst diagnostizieren, dann verändern."**

Vor jeder Code-Änderung muss die exakte, deterministische Ursache durch harte Fakten (Datenbank-Abfragen, Server-Logs, Traceability) belegt sein. Keine vorschnellen Vermutungen oder "Symptom-Pflaster", die an anderer Stelle neue Nebeneffekte erzeugen.

*Praxisbeispiel:* Genau wie bei der Fehlersuche in der **Verdrahtung eines Schaltschranks** (SPS-Steuerung): Wenn ein Schütz fälschlicherweise abfällt, tauscht man nicht auf Verdacht das Relais oder die Steuerung aus. Man misst den Schaltplan Punkt für Punkt ab (Klemmenblock, Masseschleife, Adernnummerierung), bis der verdrahtete Fehler zweifelsfrei gefunden ist.

---

## 2. Die wichtigsten Begriffe

- **Ishikawa-Diagramm (石川図 / Fischgräten-Diagramm) & 5-Why W-Fragen:**
  Entwickelt von Kaoru Ishikawa im Maschinenbau/Qualitätsmanagement. Durch wiederholtes Hinterfragen ("Warum?") entwirrt man Ursache-Wirkungs-Ketten bis zur Grundursache (Mensch, Maschine, Methode, Material, Umgebung, Messung).
- **Root Cause Analysis (RCA / Hauptursachenanalyse):**
  Systematisches Zurückverfolgen eines Fehlers bis zu seiner eigentlichen Wurzel (z.B. Datenbank-Zuweisung, API-Vertrag, Verdrahtungsfehler) – statt nur das kaputte Bauteil/Symptom auf Verdacht zu tauschen.
- **Genchi Genbutsu (現地現物):**
  "Geh hin und sieh selbst nach" – Fakten direkt am Ort des Geschehens untersuchen (SQL-DB, Server-Logs) statt Vermutungen anzustellen.
- **Evidence-Based Debugging (Evidenzbasiertes Debugging):**
  Jede Diagnose stützt sich auf überprüfbare Fakten (z.B. SQL-Ergebnisse aus `screentime.db`, Server-Logfiles, Browser-Webview-Events).
- **Diagnose-First / Read-Only Audit:**
  In der ersten Phase wird ausschließlich analysiert und gelesen. Erst nach Erstellung eines verifizierten Plans und der Zustimmung des Nutzers wird Code verändert.

---

## 3. Empfohlene Prompt-Stichwörter für Anfragen

Wenn du der KI eine neue Aufgabe oder eine Fehlersuche gibst, kannst du folgende Stichwörter verwenden:

- **`Diagnose-First:`** *"Diagnose-First: Analysiere bitte erst den Code und die Datenbank, finde die genaue Ursache und mache einen Änderungsvorschlag, bevor du etwas änderst."*
- **`Root-Cause-Audit:`** *"Führe ein Root-Cause-Audit für Problem X durch. Noch nichts im Code verändern!"*
- **`Plan-Only:`** *"Erstelle zuerst einen detaillierten Umsetzungsplan."*

---

## 4. Antigravity Slash-Commands & Tools

- **/grill-me**: Startet ein gezieltes Interview, um Unklarheiten oder Designfragen vorab zu klären.
- **/goal**: Aktiviert den Gründlichkeitsmodus für komplexe Aufgabenstellungen.
- **`.agents/rules/diagnose_first.md`**: Regeldatei im Projekt, die dieses Verhalten für KI-Assistenten dauerhaft erzwingt.
