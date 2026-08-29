package de.familie.screentime;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenTimeAlarm")
public class ScreenTimeAlarmPlugin extends Plugin {
    private static final String TAG = "ScreenTimeAlarmPlugin";

    private int getRequestCodeForSession(long sessionId) {
        return (int) (Math.abs(sessionId) % 1000000);
    }

    @PluginMethod
    public void scheduleAlarm(PluginCall call) {
        Long sessionId = call.getLong("sessionId");
        String childName = call.getString("childName", "Kind");
        String deviceLabel = call.getString("deviceLabel", "Gerät");
        Long triggerAtMs = call.getLong("triggerAtMs");

        if (sessionId == null || triggerAtMs == null) {
            call.reject("sessionId and triggerAtMs are required");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            call.reject("AlarmManager not available");
            return;
        }

        try {
            int requestCode = getRequestCodeForSession(sessionId);

            // 1. AlarmReceiver Intent
            Intent receiverIntent = new Intent(context, AlarmReceiver.class);
            receiverIntent.putExtra("sessionId", sessionId);
            receiverIntent.putExtra("childName", childName);
            receiverIntent.putExtra("deviceLabel", deviceLabel);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, requestCode, receiverIntent, flags);

            // 2. ShowIntent for AlarmClockInfo (tapping clock in system UI launches app)
            Intent showIntent = new Intent(context, MainActivity.class);
            showIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent showPendingIntent = PendingIntent.getActivity(context, requestCode + 10000, showIntent, flags);

            // 3. Schedule via AlarmManager.setAlarmClock (exact, highest priority, bypasses Doze)
            AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(triggerAtMs, showPendingIntent);
            alarmManager.setAlarmClock(clockInfo, pendingIntent);

            Log.i(TAG, "Scheduled native setAlarmClock for session #" + sessionId + " (" + childName + ") at ms: " + triggerAtMs);

            JSObject res = new JSObject();
            res.put("success", true);
            res.put("sessionId", sessionId);
            res.put("triggerAtMs", triggerAtMs);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Error scheduling alarm clock: " + e.getMessage(), e);
            call.reject("Failed to schedule alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        Long sessionId = call.getLong("sessionId");
        if (sessionId == null) {
            call.reject("sessionId is required");
            return;
        }

        Context context = getContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        try {
            int requestCode = getRequestCodeForSession(sessionId);
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

            // Also stop sound service if active
            Intent stopServiceIntent = new Intent(context, AlarmSoundService.class);
            stopServiceIntent.setAction(AlarmSoundService.ACTION_STOP_ALARM);
            context.startService(stopServiceIntent);

            Log.i(TAG, "Cancelled native alarm clock for session #" + sessionId);

            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling alarm clock: " + e.getMessage(), e);
            call.reject("Failed to cancel alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopActiveAlarm(PluginCall call) {
        try {
            Context context = getContext();
            Intent stopServiceIntent = new Intent(context, AlarmSoundService.class);
            stopServiceIntent.setAction(AlarmSoundService.ACTION_STOP_ALARM);
            context.startService(stopServiceIntent);

            Log.i(TAG, "stopActiveAlarm called");

            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping active alarm: " + e.getMessage(), e);
            call.reject("Failed to stop active alarm: " + e.getMessage());
        }
    }
}
