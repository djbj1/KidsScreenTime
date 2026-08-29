package de.familie.screentime;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class BackgroundSyncService extends Service {
    private static final String TAG = "BackgroundSyncService";
    private static final String CHANNEL_ID = "screentime_sync_channel";
    private static final int NOTIFICATION_ID = 9901;
    private static final String DEFAULT_SERVER_URL = "http://192.168.178.227:3000";

    private Thread syncThread = null;
    private volatile boolean isRunning = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildForegroundNotification());

        if (!isRunning) {
            isRunning = true;
            syncThread = new Thread(this::runSyncLoop, "ScreenTimeBackgroundSync");
            syncThread.start();
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        if (syncThread != null) {
            syncThread.interrupt();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "ScreenTime Synchronisation",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Hält die Timer-Synchronisation im Hintergrund aktiv");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildForegroundNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, flags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ScreenTime Wächter aktiv")
            .setContentText("Hintergrund-Synchronisation mit dem Heimnetzwerk aktiv")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void runSyncLoop() {
        Log.i(TAG, "Starting background sync loop...");

        while (isRunning) {
            try {
                // 1. Initial snapshot check: Fetch all currently active sessions
                fetchAndScheduleActiveSessions();

                // 2. Open SSE stream for instant real-time push events
                connectEventStream();
            } catch (Exception e) {
                Log.w(TAG, "Sync loop connection dropped: " + e.getMessage());
            }

            // Wait 5 seconds before attempting reconnect
            if (isRunning) {
                try {
                    Thread.sleep(5000);
                } catch (InterruptedException e) {
                    break;
                }
            }
        }
    }

    private void fetchAndScheduleActiveSessions() {
        try {
            URL url = new URL(DEFAULT_SERVER_URL + "/api/sessions/active?all=true");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();

                JSONArray sessions = new JSONArray(sb.toString());
                for (int i = 0; i < sessions.length(); i++) {
                    JSONObject session = sessions.getJSONObject(i);
                    long sessionId = session.optLong("id");
                    String status = session.optString("status");
                    long expiresAt = session.optLong("expires_at");
                    String childName = session.optString("user_name", "Kind");
                    String deviceLabel = session.optString("device_name", "Gerät");

                    if ("active".equals(status) && expiresAt > 0) {
                        long triggerAtMs = expiresAt * 1000L;
                        if (triggerAtMs > System.currentTimeMillis()) {
                            scheduleAlarm(sessionId, childName, deviceLabel, triggerAtMs);
                        }
                    } else if ("paused".equals(status)) {
                        cancelAlarm(sessionId);
                    }
                }
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.d(TAG, "Error fetching active sessions snapshot: " + e.getMessage());
        }
    }

    private void connectEventStream() {
        HttpURLConnection conn = null;
        BufferedReader reader = null;
        try {
            URL url = new URL(DEFAULT_SERVER_URL + "/api/events");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "text/event-stream");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(0); // Infinite read timeout for SSE stream

            if (conn.getResponseCode() != 200) {
                return;
            }

            reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            String line;
            String currentEvent = null;

            while (isRunning && (line = reader.readLine()) != null) {
                line = line.trim();
                if (line.startsWith("event:")) {
                    currentEvent = line.substring(6).trim();
                } else if (line.startsWith("data:") && currentEvent != null) {
                    String dataStr = line.substring(5).trim();
                    handleSseEvent(currentEvent, dataStr);
                    currentEvent = null;
                }
            }
        } catch (Exception e) {
            Log.d(TAG, "SSE stream disconnected: " + e.getMessage());
        } finally {
            if (reader != null) {
                try { reader.close(); } catch (Exception ignored) {}
            }
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private void handleSseEvent(String eventType, String dataJson) {
        try {
            JSONObject data = new JSONObject(dataJson);
            long sessionId = data.optLong("sessionId", 0L);
            String childName = data.optString("userName", "Kind");
            String deviceLabel = data.optString("deviceName", "Gerät");
            long expiresAt = data.optLong("expiresAt", 0L);

            Log.i(TAG, "Received SSE event: " + eventType + " for session #" + sessionId);

            switch (eventType) {
                case "session_start":
                case "session_resume":
                    if (sessionId > 0 && expiresAt > 0) {
                        long triggerAtMs = expiresAt * 1000L;
                        scheduleAlarm(sessionId, childName, deviceLabel, triggerAtMs);
                    }
                    break;
                case "session_pause":
                case "session_cancel":
                case "session_acknowledge":
                    if (sessionId > 0) {
                        cancelAlarm(sessionId);
                    }
                    break;
                case "session_expired":
                    if (sessionId > 0) {
                        triggerAlarmNow(sessionId, childName, deviceLabel);
                    }
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing SSE event: " + e.getMessage(), e);
        }
    }

    private void scheduleAlarm(long sessionId, String childName, String deviceLabel, long triggerAtMs) {
        try {
            Context context = getApplicationContext();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            int requestCode = (int) (Math.abs(sessionId) % 1000000);

            Intent receiverIntent = new Intent(context, AlarmReceiver.class);
            receiverIntent.putExtra("sessionId", sessionId);
            receiverIntent.putExtra("childName", childName);
            receiverIntent.putExtra("deviceLabel", deviceLabel);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, requestCode, receiverIntent, flags);

            Intent showIntent = new Intent(context, MainActivity.class);
            showIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent showPendingIntent = PendingIntent.getActivity(context, requestCode + 10000, showIntent, flags);

            AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(triggerAtMs, showPendingIntent);
            alarmManager.setAlarmClock(clockInfo, pendingIntent);

            Log.i(TAG, "BackgroundSyncService scheduled setAlarmClock for session #" + sessionId + " at ms: " + triggerAtMs);
        } catch (Exception e) {
            Log.e(TAG, "Error in BackgroundSyncService scheduleAlarm: " + e.getMessage(), e);
        }
    }

    private void cancelAlarm(long sessionId) {
        try {
            Context context = getApplicationContext();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            int requestCode = (int) (Math.abs(sessionId) % 1000000);

            Intent receiverIntent = new Intent(context, AlarmReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, requestCode, receiverIntent, flags);

            if (alarmManager != null && pendingIntent != null) {
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
            }

            Intent stopServiceIntent = new Intent(context, AlarmSoundService.class);
            stopServiceIntent.setAction(AlarmSoundService.ACTION_STOP_ALARM);
            context.startService(stopServiceIntent);

            Log.i(TAG, "BackgroundSyncService cancelled alarm for session #" + sessionId);
        } catch (Exception e) {
            Log.e(TAG, "Error in BackgroundSyncService cancelAlarm: " + e.getMessage(), e);
        }
    }

    private void triggerAlarmNow(long sessionId, String childName, String deviceLabel) {
        try {
            Context context = getApplicationContext();
            Intent receiverIntent = new Intent(context, AlarmReceiver.class);
            receiverIntent.putExtra("sessionId", sessionId);
            receiverIntent.putExtra("childName", childName);
            receiverIntent.putExtra("deviceLabel", deviceLabel);
            context.sendBroadcast(receiverIntent);
        } catch (Exception e) {
            Log.e(TAG, "Error triggering alarm now: " + e.getMessage(), e);
        }
    }
}