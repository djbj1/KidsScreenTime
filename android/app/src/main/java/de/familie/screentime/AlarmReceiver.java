package de.familie.screentime;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.content.ContextCompat;

public class AlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "AlarmReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.i(TAG, "ScreenTime AlarmClock triggered!");

        long sessionId = intent.getLongExtra("sessionId", 0L);
        String childName = intent.getStringExtra("childName");
        String deviceLabel = intent.getStringExtra("deviceLabel");

        // Acquire a 10-second wake lock to ensure service starts reliably even in deep sleep
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "screentime:alarm_wakeup");
            wakeLock.acquire(10000L);
        }

        try {
            Intent serviceIntent = new Intent(context, AlarmSoundService.class);
            serviceIntent.setAction(AlarmSoundService.ACTION_START_ALARM);
            serviceIntent.putExtra("sessionId", sessionId);
            serviceIntent.putExtra("childName", childName != null ? childName : "Kind");
            serviceIntent.putExtra("deviceLabel", deviceLabel != null ? deviceLabel : "Gerät");

            ContextCompat.startForegroundService(context, serviceIntent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start AlarmSoundService: " + e.getMessage(), e);
        }
    }
}
