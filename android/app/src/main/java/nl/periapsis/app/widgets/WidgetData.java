package nl.periapsis.app.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.text.format.DateFormat;

import androidx.annotation.Nullable;

import nl.periapsis.app.MainActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Shared snapshot access + helpers for all Periapsis home-screen widgets. */
public final class WidgetData {
    public static final String PREFS = "periapsis_widgets", KEY = "snapshot";

    /** kind -> default provider class (live kinds are looked up by name so this compiles without them). */
    public static final Map<String, Class<?>> KINDS = new HashMap<>();

    static {
        KINDS.put("planets", PlanetsWidget.class);
        KINDS.put("moon", MoonWidget.class);
        KINDS.put("sun", SunWidget.class);
        KINDS.put("tonight", TonightWidget.class);
        String[][] live = {
                {"events", "EventsWidget"}, {"iss", "IssWidget"}, {"launch", "LaunchWidget"}, {"kp", "KpWidget"}};
        for (String[] kv : live) {
            try {
                KINDS.put(kv[0], Class.forName("nl.periapsis.app.widgets." + kv[1]));
            } catch (Throwable ignored) {
                // class not present in this build
            }
        }
    }

    private WidgetData() {}

    @Nullable
    public static JSONObject load(Context c) {
        try {
            String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    public static void save(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
    }

    /** Broadcast an update to every placed widget of this app. */
    public static void refreshAll(Context c) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(c);
            List<AppWidgetProviderInfo> infos = mgr.getInstalledProviders();
            for (AppWidgetProviderInfo info : infos) {
                ComponentName cn = info.provider;
                if (cn == null || !c.getPackageName().equals(cn.getPackageName())) continue;
                int[] ids = mgr.getAppWidgetIds(cn);
                if (ids == null || ids.length == 0) continue;
                Intent i = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                i.setComponent(cn);
                i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
                c.sendBroadcast(i);
            }
        } catch (Exception ignored) {
            // widgets are best-effort
        }
    }

    public static PendingIntent openApp(Context c, String deepLink, int requestCode) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink));
        i.setClass(c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    public static String label(@Nullable JSONObject snap, String key, String fallback) {
        if (snap == null) return fallback;
        JSONObject l = snap.optJSONObject("labels");
        if (l == null) return fallback;
        String s = l.optString(key, "");
        return s.isEmpty() ? fallback : s;
    }

    @Nullable
    public static JSONObject currentNight(@Nullable JSONObject snap, long now) {
        if (snap == null) return null;
        JSONArray a = snap.optJSONArray("nights");
        if (a == null) return null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject n = a.optJSONObject(i);
            if (n != null && n.optLong("end", 0) > now) return n;
        }
        return null;
    }

    /** Local time of day, respecting the device 24h setting. */
    public static String time(Context c, long ms) {
        String pattern = DateFormat.is24HourFormat(c) ? "HH:mm" : "h:mm a";
        return new SimpleDateFormat(pattern, Locale.getDefault()).format(new Date(ms));
    }

    /** Time of day, prefixed with a short weekday when it is not today. */
    public static String when(Context c, long ms, long now) {
        SimpleDateFormat d = new SimpleDateFormat("yyyyMMdd", Locale.US);
        if (d.format(new Date(ms)).equals(d.format(new Date(now)))) return time(c, ms);
        return new SimpleDateFormat("EEE", Locale.getDefault()).format(new Date(ms)) + " " + time(c, ms);
    }

    public static int alpha255(@Nullable JSONObject snap) {
        double a = 0.85;
        if (snap != null) {
            JSONObject st = snap.optJSONObject("style");
            if (st != null) a = st.optDouble("alpha", 0.85);
        }
        if (Double.isNaN(a)) a = 0.85;
        return (int) Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
}
