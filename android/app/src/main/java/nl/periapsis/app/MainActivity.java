package nl.periapsis.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class); // local plugin: in-app APK update
        super.onCreate(savedInstanceState);
    }
}
