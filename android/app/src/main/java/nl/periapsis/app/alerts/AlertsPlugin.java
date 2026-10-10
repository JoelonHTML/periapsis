package nl.periapsis.app.alerts;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/**
 * JS bridge for the background alerts (space weather, launches). The app writes its settings as one JSON string;
 * WorkManager then polls the public feeds every ~30 min, also while the app is closed.
 */
@CapacitorPlugin(
        name = "PeriapsisAlerts",
        permissions = {@Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})}
)
public class AlertsPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(AlertsWorker.PREFS, Context.MODE_PRIVATE);
    }

    private static Constraints net() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    /** configure({ json }): store the config and (re)schedule or cancel the periodic poll. */
    @PluginMethod
    public void configure(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("no-json");
            return;
        }
        boolean remote;
        try {
            JSONObject o = new JSONObject(json);
            JSONObject sw = o.optJSONObject("spaceweather"), ln = o.optJSONObject("launches");
            remote = (sw != null && sw.optBoolean("on", false)) || (ln != null && ln.optBoolean("on", false));
        } catch (Exception e) {
            call.reject("bad-json");
            return;
        }
        try {
            WorkManager wm = WorkManager.getInstance(getContext());
            if (remote) {
                PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(AlertsWorker.class, 30, TimeUnit.MINUTES, 10, TimeUnit.MINUTES)
                        .setConstraints(net())
                        .build();
                wm.enqueueUniquePeriodicWork(AlertsWorker.WORK_PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req);
            } else {
                wm.cancelUniqueWork(AlertsWorker.WORK_PERIODIC);
            }
            prefs().edit().putString("config", json).putBoolean("scheduled", remote).apply();
        } catch (Exception e) {
            call.reject("schedule-failed: " + e);
            return;
        }
        call.resolve();
    }

    /** checkNow({ test?: boolean }): run one poll now (test:true also posts a sample notification). Resolves once enqueued. */
    @PluginMethod
    public void checkNow(PluginCall call) {
        try {
            Data data = new Data.Builder().putBoolean(AlertsWorker.KEY_TEST, Boolean.TRUE.equals(call.getBoolean("test", false))).build();
            OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(AlertsWorker.class).setConstraints(net()).setInputData(data).build();
            WorkManager.getInstance(getContext()).enqueueUniqueWork(AlertsWorker.WORK_ONCE, ExistingWorkPolicy.REPLACE, req);
            call.resolve();
        } catch (Exception e) {
            call.reject("enqueue-failed: " + e);
        }
    }

    /** status() -> { scheduled, lastRun (ms | null), lastError (string | null), notificationsAllowed }. */
    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject ret = new JSObject();
        ret.put("scheduled", p.getBoolean("scheduled", false));
        long last = p.getLong("lastRun", 0);
        ret.put("lastRun", last > 0 ? (Object) last : JSObject.NULL);
        String err = p.getString("lastError", null);
        ret.put("lastError", err == null ? (Object) JSObject.NULL : err);
        ret.put("notificationsAllowed", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(ret);
    }

    /** requestPermission() -> { granted }: asks for POST_NOTIFICATIONS on Android 13+ (older versions need none). */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveGranted(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        resolveGranted(call);
    }

    private void resolveGranted(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(ret);
    }
}
