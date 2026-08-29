import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { startWatchdog } from './watchdog.js';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Route to download Android APK
app.get('/screentime.apk', (req, res) => {
  const apkPath = path.join(__dirname, '../public/screentime.apk');
  res.download(apkPath, 'screentime.apk', (err) => {
    if (err) {
      res.status(404).send('APK-Datei wird derzeit erstellt. Bitte in 1 Minute erneut versuchen.');
    }
  });
});

// Static file serving for built Vite Frontend
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Fallback to index.html for Single Page Application routing
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      // If client is not built yet, return informative placeholder
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>ScreenTime Cockpit Server</title></head>
        <body style="font-family:sans-serif; background:#0f1117; color:#fff; padding:2rem; text-align:center;">
          <h1>⏱️ ScreenTime Cockpit Backend Running</h1>
          <p>Port 3000 REST API is active.</p>
          <p>API status: <a href="/api/users" style="color:#6366f1">/api/users</a></p>
        </body>
        </html>
      `);
    }
  });
});

// Boot procedure
const startServer = async () => {
  try {
    await initDb();
    startWatchdog();

    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`🚀 ScreenTime Cockpit Single-Server Running!`);
      console.log(`🌐 Web Dashboard & REST API: http://localhost:${PORT}`);
      console.log(`=================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
