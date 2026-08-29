package de.familie.screentime;

import android.content.Intent;
import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenTimeAlarmPlugin.class);
        super.onCreate(savedInstanceState);

        try {
            Intent syncIntent = new Intent(this, BackgroundSyncService.class);
            ContextCompat.startForegroundService(this, syncIntent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
