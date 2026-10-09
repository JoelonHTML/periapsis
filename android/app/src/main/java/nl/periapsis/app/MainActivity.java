package nl.periapsis.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class); // local plugin: in-app APK update
        registerPlugin(nl.periapsis.app.widgets.WidgetsPlugin.class); // home-screen widgets bridge
        super.onCreate(savedInstanceState);
    }
}
