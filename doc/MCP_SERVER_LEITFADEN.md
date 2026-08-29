# Leitfaden: MCP-Server – Das Werkzeug-System für LLMs & KI-Agenten

## 1. Was ist ein MCP-Server?

**MCP** steht für **Model Context Protocol** (Modell-Kontext-Protokoll). Es ist ein offener Schnittstellen-Standard, der von führenden KI-Entwicklern (u. a. Anthropic, Google) ins Leben gerufen wurde.

Stell dir MCP wie einen **universellen USB-Steckplatz für Sprachmodelle (LLMs)** vor:
Über MCP kann ein Sprachmodell (wie Gemini oder Claude) direkt auf externe Software-Werkzeuge, Datenbanken, APIs und Dateisysteme zugreifen, anstatt nur Text auszugeben.

---

## 2. Der Unterschied: Text-KI vs. Agentic LLM mit MCP

| Eigenschaft | Reine Text-KI (Chatbot) | KI-Agent mit MCP / Tools |
| :--- | :--- | :--- |
| **Arbeitsweise** | Kann nur Text schreiben & beantworten | Kann selbstständig Aktionen ausführen |
| **Datenzugriff** | Weiß nur, was du in den Chat kopierst | Liest direkt aus SQL-DBs, APIs, Git etc. |
| **Arbeitsaufwand** | Manuelles Manuelles Manuelles Copy-Paste erforderlich | Autonome Lösung von Aufgaben |
| **Analytik** | Rät oder halluziniert bei fehlenden Daten | Prüft Fakten direkt am System (Evidenzbasiert) |

---

## 3. Funktionsweise: Wie nutzt ein LLM einen MCP-Server?

1. **Tool Discovery (Werkzeug-Erkennung):** Beim Start meldet sich der MCP-Server bei der KI-Umgebung (z. B. Antigravity IDE) und präsentiert seine verfügbaren Funktionen (z. B. `read_query`, `write_record`, `send_slack_message`).
2. **Function Calling (Werkzeug-Aufruf):** Wenn du der KI eine Aufgabe gibst (z. B. *"Welcher User ist in der DB eingetragen?"*), entscheidet das LLM selbstständig, das passende Werkzeug des MCP-Servers aufzurufen.
3. **Ausführung & Antwort:** Der MCP-Server führt die Abfrage lokal oder remote aus und liefert das Ergebnis an das LLM zurück. Das LLM analysiert die Daten und antwortet dir.

---

## 4. Beliebte MCP-Server in der Praxis

### 🗄️ Datenbanken
- **SQLite / PostgreSQL / MySQL / MongoDB:** Direkte SQL-Abfragen, Schema-Inspektion und Datenanalyse ohne manuelles Skripten.

### 🛠️ Entwickler-Tools
- **GitHub / GitLab:** Issues durchsuchen, Pull Requests erstellen, Code-Reviews automatisieren.
- **Sentry / Datadog:** Produktions-Fehlerberichte und Logs direkt von der KI analysieren lassen.
- **Docker / Kubernetes:** Container-Zustände prüfen und Logs einsehen.

### 💼 Produktivität & Design
- **Figma:** UI-Designs in der KI analysieren und direkt in Frontend-Code umwandeln.
- **Notion / Trello / Jira:** Aufgaben lesen, Projekt-Status prüfen, Tickets aktualisieren.
- **Slack / Discord:** Benachrichtigungen oder Zusammenfassungen an Channels senden.

---

## 5. Einbindung in Antigravity IDE (`mcp_config.json`)

MCP-Server werden über eine einfache JSON-Datei eingebunden.

### Speicherorte:
- **Global:** `~/.gemini/config/mcp_config.json` (Gilt für alle Projekte)
- **Projekt-Plugin:** `plugins/<plugin_name>/mcp_config.json`

### Beispiel-Konfiguration:

```json
{
  "mcpServers": {
    "sqlite-helper": {
      "command": "sqlite-mcp-server",
      "args": ["/path/to/screentime.db"]
    },
    "github-integration": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

## 6. Die wichtigsten Vorteile

- **Kein Copy-Paste mehr:** Die KI holt sich benötigte Kontext-Daten selbstständig.
- **Sicherheit & Kontrolle:** Du bestimmst in den Einstellungen genau, welche Tools und Rechte (z. B. Nur Lesen vs. Schreiben) die KI besitzt.
- **Zukunftssicher:** Einmal geschriebene MCP-Server funktionieren mit jedem KI-Modell, das den MCP-Standard unterstützt.
