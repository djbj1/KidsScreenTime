package de.familie.screentime;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenTimeAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
