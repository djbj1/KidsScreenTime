package de.familie.screentime;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class AlarmSoundService extends Service {
    private static final String TAG = "AlarmSoundService";
    public static final String ACTION_START_ALARM = "de.familie.screentime.ACTION_START_ALARM";
    public static final String ACTION_STOP_ALARM = "de.familie.screentime.ACTION_STOP_ALARM";
    public static final String CHANNEL_ID = "screentime_alarm_clock_channel_v1";
    public static final int NOTIFICATION_ID = 999111;

    private static boolean isAlarmActive = false;
    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private Handler autoStopHandler;
    private Runnable autoStopRunnable;

    public static boolean isAlarmRunning() {
        return isAlarmActive;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP_ALARM.equals(intent.getAction())) {
            Log.i(TAG, "Stopping AlarmSoundService via ACTION_STOP_ALARM");
            stopAlarm();
            stopSelf();
            return START_NOT_STICKY;
        }

        String childName = intent != null ? intent.getStringExtra("childName") : "Kind";
        String deviceLabel = intent != null ? intent.getStringExtra("deviceLabel") : "Gerät";
        if (childName == null) childName = "Kind";
        if (deviceLabel == null) deviceLabel = "Gerät";

        Log.i(TAG, "Starting alarm playback for child: " + childName + " on device: " + deviceLabel);
        startAlarm(childName, deviceLabel);

        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "ScreenTime Alarm Clock",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Laute kontinuierliche Wecker-Alarme für abgelaufene Spielzeit");
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                channel.enableVibration(true);
                channel.enableLights(true);

                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build();

                Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.alarm);
                channel.setSound(soundUri, audioAttributes);

                nm.createNotificationChannel(channel);
            }
        }
    }

    private void startAlarm(String childName, String deviceLabel) {
        isAlarmActive = true;

        // 1. PendingIntent for opening MainActivity on tap
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // 2. PendingIntent for "🛑 ALARM STOPPEN" Action Button
        Intent stopIntent = new Intent(this, AlarmSoundService.class);
        stopIntent.setAction(ACTION_STOP_ALARM);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // 3. Build high-priority Heads-Up Notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("🚨 ZEIT ABGELAUFEN!")
            .setContentText("Achtung! Die Spielzeit für " + childName + " (" + deviceLabel + ") ist abgelaufen!")
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText("Achtung! Die Spielzeit für " + childName + " (" + deviceLabel + ") ist abgelaufen! Bitte Gerät jetzt beenden."))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(contentPendingIntent)
            .setFullScreenIntent(contentPendingIntent, true)
            .setOngoing(true)
            .setAutoCancel(false)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "🛑 ALARM STOPPEN", stopPendingIntent);

        Notification notification = builder.build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } catch (Exception e) {
                startForeground(NOTIFICATION_ID, notification);
            }
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // 4. Start looping audio stream using USAGE_ALARM (ducks other media like YouTube during alarm)
        playLoopingSound();

        // 5. Start repeating vibration
        startVibration();

        // 6. Safety timeout: automatically stop after 10 minutes if completely unacknowledged
        if (autoStopHandler == null) {
            autoStopHandler = new Handler(Looper.getMainLooper());
        }
        if (autoStopRunnable != null) {
            autoStopHandler.removeCallbacks(autoStopRunnable);
        }
        autoStopRunnable = () -> {
            Log.i(TAG, "Alarm auto-stopped after timeout");
            stopAlarm();
            stopSelf();
        };
        autoStopHandler.postDelayed(autoStopRunnable, 10 * 60 * 1000L);
    }

    private void playLoopingSound() {
        try {
            if (mediaPlayer != null) {
                try {
                    mediaPlayer.stop();
                    mediaPlayer.release();
                } catch (Exception ignored) {}
                mediaPlayer = null;
            }

            mediaPlayer = new MediaPlayer();
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();

            mediaPlayer.setAudioAttributes(audioAttributes);
            mediaPlayer.setAudioStreamType(AudioManager.STREAM_ALARM);

            Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.alarm);
            try {
                mediaPlayer.setDataSource(getApplicationContext(), soundUri);
            } catch (Exception e) {
                Uri defaultAlarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (defaultAlarmUri == null) {
                    defaultAlarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                }
                mediaPlayer.setDataSource(getApplicationContext(), defaultAlarmUri);
            }

            mediaPlayer.setLooping(true);
            mediaPlayer.setVolume(1.0f, 1.0f);
            mediaPlayer.prepare();
            mediaPlayer.start();
            Log.i(TAG, "MediaPlayer started looping alarm sound with USAGE_ALARM");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start MediaPlayer: " + e.getMessage(), e);
        }
    }

    private void startVibration() {
        try {
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 600, 400, 600, 400};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Vibration failed: " + e.getMessage());
        }
    }

    private void stopAlarm() {
        isAlarmActive = false;

        if (autoStopHandler != null && autoStopRunnable != null) {
            autoStopHandler.removeCallbacks(autoStopRunnable);
        }

        try {
            if (mediaPlayer != null) {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
                mediaPlayer = null;
            }
        } catch (Exception e) {
            Log.w(TAG, "Error releasing MediaPlayer: " + e.getMessage());
        }

        try {
            if (vibrator != null) {
                vibrator.cancel();
            }
        } catch (Exception ignored) {}

        try {
            stopForeground(true);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIFICATION_ID);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        stopAlarm();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
