package nl.periapsis.app.alerts;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import nl.periapsis.app.R;
import nl.periapsis.app.widgets.WidgetData;

/**
 * Background alerts: polls NOAA SWPC and Launch Library 2 directly (no own server) and posts local notifications.
 * Each source is independent; a failing one is recorded in "lastError" and never stops the others.
 * Decisions live in {@link AlertsLogic}.
 */
public class AlertsWorker extends Worker {
    public static final String PREFS = "periapsis_alerts";
    public static final String WORK_PERIODIC = "periapsis_alerts_periodic";
    public static final String WORK_ONCE = "periapsis_alerts_once";
    public static final String KEY_TEST = "test";

    private static final String SWPC = "https://services.swpc.noaa.gov/";
    private static final String LL_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=5&mode=list";
    private static final String LL_URL_FALLBACK = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&mode=list";
    private static final String DEEP_LINK = "periapsis://open/sky/live";
    private static final long LAUNCH_FETCH_EVERY = 60 * 60_000L;
    private static final long SEEN_TTL = 48 * AlertsLogic.HOUR;

    private SharedPreferences prefs;
    private JSONObject cfg = new JSONObject();
    private JSONObject texts = new JSONObject();
    private final Map<String, Long> seen = new HashMap<>();
    private final List<String> errors = new ArrayList<>();
    private long now;
    private boolean quiet;

    public AlertsWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        now = System.currentTimeMillis();
        try {
            run(c);
        } catch (Throwable t) {
            errors.add("run: " + t);
        }
        saveSeen();
        SharedPreferences.Editor e = prefs.edit();
        e.putLong("lastRun", now);
        if (errors.isEmpty()) e.remove("lastError");
        else e.putString("lastError", join(errors));
        e.apply();
        return Result.success(); // never retry: the next periodic run is soon enough, and retries would bypass the flex window
    }

    private void run(Context c) {
        try {
            cfg = new JSONObject(prefs.getString("config", "{}"));
        } catch (Exception e) {
            errors.add("config: " + e);
            return;
        }
        JSONObject tx = cfg.optJSONObject("texts");
        if (tx != null) texts = tx;
        JSONObject sw = cfg.optJSONObject("spaceweather");
        JSONObject ln = cfg.optJSONObject("launches");
        boolean swOn = sw != null && sw.optBoolean("on", false);
        boolean lnOn = ln != null && ln.optBoolean("on", false);
        boolean test = getInputData().getBoolean(KEY_TEST, false);

        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) {
            errors.add("notifications are disabled for the app");
            return;
        }
        JSONObject q = cfg.optJSONObject("quiet");
        Calendar cal = Calendar.getInstance();
        quiet = q != null && q.optBoolean("on", false)
                && AlertsLogic.inQuiet(cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE), q.optString("from", "23:00"), q.optString("to", "07:00"));

        loadSeen();
        AlertsLogic.prune(seen, now);

        if (test) post("test", "test:" + now, t("test_title", "Periapsis alerts"), t("test_body", "Notifications are working."), false);

        if (swOn) {
            try { checkKp(c, sw); } catch (Throwable e) { errors.add("kp: " + e); }
            try { checkAlerts(sw); } catch (Throwable e) { errors.add("alerts: " + e); }
            try { checkFlares(sw); } catch (Throwable e) { errors.add("flares: " + e); }
            try { checkAurora(sw); } catch (Throwable e) { errors.add("aurora: " + e); }
        }
        if (lnOn) {
            try { checkLaunches(ln); } catch (Throwable e) { errors.add("launches: " + e); }
        }
    }

    // ------------------------------------------------------------------ sources

    private void checkKp(Context c, JSONObject sw) throws Exception {
        double kpMin = sw.optDouble("kpMin", 5);
        double obsKp = -1, predKp = -1;
        long obsT = 0, predT = 0;
        Exception first = null;
        try {
            long best = -1;
            for (JSONObject r : rows(new JSONArray(http(SWPC + "products/noaa-planetary-k-index.json")))) {
                long tt = AlertsLogic.parseUtc(r.optString("time_tag", ""));
                double kp = firstDouble(r, "Kp", "kp", "kp_index");
                if (tt > best && !Double.isNaN(kp) && tt <= now + AlertsLogic.HOUR) { best = tt; obsT = tt; obsKp = kp; }
            }
        } catch (Exception e) {
            first = e;
        }
        try {
            for (JSONObject r : rows(new JSONArray(http(SWPC + "products/noaa-planetary-k-index-forecast.json")))) {
                if ("observed".equalsIgnoreCase(r.optString("observed", ""))) continue;
                long tt = AlertsLogic.parseUtc(r.optString("time_tag", ""));
                double kp = firstDouble(r, "kp", "Kp", "kp_index");
                if (tt < 0 || Double.isNaN(kp)) continue;
                // slot = 3 h starting at tt: current or the next 24 h
                if (tt + 3 * AlertsLogic.HOUR > now && tt <= now + 24 * AlertsLogic.HOUR && kp > predKp) { predKp = kp; predT = tt; }
            }
        } catch (Exception e) {
            if (first != null) throw first;
            errors.add("kp-forecast: " + e);
        }
        double kp;
        long slot;
        String kind;
        if (obsKp >= kpMin && obsKp >= predKp) { kp = obsKp; slot = obsT; kind = "observed"; }
        else if (predKp >= kpMin) { kp = predKp; slot = predT; kind = "predicted"; }
        else return;
        int g = AlertsLogic.gScale(kp);
        if (g < 1) return;
        String gs = "G" + g;
        String title = AlertsLogic.fill(t("kp_title", "Geomagnetic storm {g}"), "g", gs, "kp", num(kp), "lat", String.valueOf(AlertsLogic.kpLatitude(g)), "kind", kind);
        String body = AlertsLogic.fill(t("kp_body", "Kp {kp} - aurora possible down to ~{lat}° latitude"), "g", gs, "kp", num(kp), "lat", String.valueOf(AlertsLogic.kpLatitude(g)), "kind", kind);
        emit("kp", "kp:" + (slot / (3 * AlertsLogic.HOUR)) + ":" + g, g, title, body, true, false);
    }

    private void checkAlerts(JSONObject sw) throws Exception {
        boolean watches = sw.optBoolean("watches", true), cme = sw.optBoolean("cme", false), radio = sw.optBoolean("radio", false);
        if (!watches && !cme && !radio) return;
        JSONArray a = new JSONArray(http(SWPC + "products/alerts.json"));
        Map<String, Object[]> best = new HashMap<>(); // category -> {Alert, key, issueMs}
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            String pid = o.optString("product_id", ""), issue = o.optString("issue_datetime", "");
            long it = AlertsLogic.parseUtc(issue);
            AlertsLogic.Alert al = AlertsLogic.classify(pid, o.optString("message", ""));
            if (al.category.equals("ignore") || it < 0) continue;
            long maxAge = al.category.equals("watch") ? 24 * AlertsLogic.HOUR : 6 * AlertsLogic.HOUR;
            if (now - it > maxAge || it > now + AlertsLogic.HOUR) continue;
            if ((al.category.equals("watch") && !watches) || (al.category.equals("cme") && !cme) || (al.category.equals("radio") && !radio)) continue;
            Object[] cur = best.get(al.category);
            if (cur == null || al.level > ((AlertsLogic.Alert) cur[0]).level || (al.level == ((AlertsLogic.Alert) cur[0]).level && it > (Long) cur[2])) {
                best.put(al.category, new Object[]{al, "al:" + pid + ":" + issue, it});
            }
        }
        for (Map.Entry<String, Object[]> en : best.entrySet()) {
            AlertsLogic.Alert al = (AlertsLogic.Alert) en.getValue()[0];
            String key = (String) en.getValue()[1];
            String cat = en.getKey();
            String msg = al.headline.isEmpty() ? "" : al.headline;
            if (cat.equals("watch")) {
                String gs = al.level > 0 ? "G" + al.level : "";
                emit("watch", key, al.level, AlertsLogic.fill(t("watch_title", "Geomagnetic storm watch {g}"), "g", gs, "msg", msg).trim(),
                        AlertsLogic.fill(t("watch_body", "{msg}"), "g", gs, "msg", msg), true, false);
            } else if (cat.equals("cme")) {
                emit("cme", key, 0, AlertsLogic.fill(t("cme_title", "Coronal mass ejection"), "msg", msg), AlertsLogic.fill(t("cme_body", "{msg}"), "msg", msg), true, false);
            } else {
                emit("radio", key, 0, AlertsLogic.fill(t("radio_title", "Solar radio burst"), "msg", msg), AlertsLogic.fill(t("radio_body", "{msg}"), "msg", msg), true, false);
            }
        }
    }

    private void checkFlares(JSONObject sw) throws Exception {
        String min = sw.optString("flareMin", "off");
        if (min.equalsIgnoreCase("off")) return;
        JSONArray a = new JSONArray(http(SWPC + "json/goes/primary/xray-flares-latest.json"));
        String bestCls = null, bestKey = null;
        double bestRank = -1;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            String cls = o.optString("max_class", "");
            if (cls.isEmpty()) cls = o.optString("current_class", "");
            long when = AlertsLogic.parseUtc(o.optString("max_time", o.optString("time_tag", "")));
            if (when < 0 || now - when > 6 * AlertsLogic.HOUR) continue; // old flares are not news
            if (!AlertsLogic.flareMeets(cls, min)) continue;
            double r = AlertsLogic.flareRank(cls);
            if (r > bestRank) { bestRank = r; bestCls = cls.toUpperCase(Locale.ROOT); bestKey = "fl:" + o.optString("begin_time", String.valueOf(when)) + ":" + bestCls; }
        }
        if (bestCls == null) return;
        emit("flare", bestKey, (int) (bestRank / 1000), AlertsLogic.fill(t("flare_title", "Solar flare {cls}"), "cls", bestCls),
                AlertsLogic.fill(t("flare_body", "A {cls} class flare was detected by GOES"), "cls", bestCls), true, false);
    }

    private void checkAurora(JSONObject sw) throws Exception {
        if (!sw.optBoolean("aurora", true)) return;
        JSONObject site = cfg.optJSONObject("site");
        if (site == null || !site.has("lat") || !site.has("lon")) return;
        double lat = site.optDouble("lat", Double.NaN), lon = site.optDouble("lon", Double.NaN);
        if (Double.isNaN(lat) || Double.isNaN(lon) || Math.abs(lat) > 90) return;
        if (!AlertsLogic.darkish(now, lon)) return; // only when it is dark-ish there (local solar time 18-06)
        int min = sw.optInt("auroraMin", 30);
        JSONObject o = new JSONObject(http(SWPC + "json/ovation_aurora_latest.json"));
        JSONArray co = o.optJSONArray("coordinates");
        if (co == null) throw new IOException("no coordinates");
        int pct = 0;
        for (int i = 0; i < co.length(); i++) {
            JSONArray cell = co.optJSONArray(i);
            if (cell == null || cell.length() < 3) continue;
            int cl = (int) Math.round(cell.optDouble(0, -1000)), cb = (int) Math.round(cell.optDouble(1, -1000));
            if (AlertsLogic.nearCell(cl, cb, lat, lon)) pct = Math.max(pct, (int) Math.round(cell.optDouble(2, 0)));
        }
        int tier = AlertsLogic.auroraTier(pct, min);
        if (tier < 1) return;
        String place = site.optString("name", "");
        if (place.isEmpty()) place = String.format(Locale.US, "%.1f°%s %.1f°%s", Math.abs(lat), lat >= 0 ? "N" : "S", Math.abs(lon), lon >= 0 ? "E" : "W");
        String p = String.valueOf(pct);
        emit("aurora", "au:" + AlertsLogic.nightId(now, lon) + ":" + tier, tier, AlertsLogic.fill(t("aurora_title", "Aurora chance tonight"), "pct", p, "place", place),
                AlertsLogic.fill(t("aurora_body", "{pct}% chance of aurora above {place}"), "pct", p, "place", place), true, false);
    }

    private void checkLaunches(JSONObject ln) throws Exception {
        int lead = ln.optInt("leadMin", 60);
        JSONArray cache;
        try {
            cache = new JSONArray(prefs.getString("launch_cache", "[]"));
        } catch (Exception e) {
            cache = new JSONArray();
        }
        long fetchedAt = prefs.getLong("launch_at", 0);
        if (now - fetchedAt >= LAUNCH_FETCH_EVERY || fetchedAt > now) {
            JSONArray fresh = null;
            Exception err = null;
            for (String u : new String[]{LL_URL, LL_URL_FALLBACK}) {
                try {
                    fresh = parseLaunches(new JSONObject(http(u)));
                    break;
                } catch (Exception e) {
                    err = e;
                }
            }
            if (fresh != null) {
                cache = fresh;
                prefs.edit().putString("launch_cache", fresh.toString()).putLong("launch_at", now).apply();
            } else {
                // retry in ~30 min (LL2's free tier is rate limited, do not hammer it)
                prefs.edit().putLong("launch_at", now - LAUNCH_FETCH_EVERY / 2).apply();
                errors.add("launches: " + err);
            }
        }
        for (int i = 0; i < cache.length(); i++) {
            JSONObject l = cache.optJSONObject(i);
            if (l == null) continue;
            long net = l.optLong("net", -1);
            if (!AlertsLogic.launchStatusOk(l.optString("abbrev", "")) || !AlertsLogic.launchDue(net, now, lead)) continue;
            String mins = String.valueOf(Math.max(1, (net - now + 59_999L) / 60_000L));
            String name = l.optString("name", ""), prov = l.optString("provider", "");
            String body = AlertsLogic.fill(t("launch_body", "{name} - {provider}"), "name", name, "provider", prov, "min", mins);
            if (prov.isEmpty()) body = body.replace(" - ", "").trim();
            emit("launch", "ln:" + l.optString("id", name), 0, AlertsLogic.fill(t("launch_title", "Launch in {min} min"), "name", name, "provider", prov, "min", mins), body, false, true);
        }
    }

    private static JSONArray parseLaunches(JSONObject body) throws Exception {
        JSONArray res = body.optJSONArray("results");
        if (res == null) throw new IOException("no results");
        JSONArray out = new JSONArray();
        for (int i = 0; i < res.length(); i++) {
            JSONObject r = res.optJSONObject(i);
            if (r == null) continue;
            String name = r.optString("name", "");
            long net = AlertsLogic.parseUtc(r.optString("net", ""));
            if (name.isEmpty() || net < 0) continue;
            String prov = "";
            JSONObject lsp = r.optJSONObject("launch_service_provider");
            if (lsp == null) lsp = r.optJSONObject("provider");
            if (lsp != null) prov = lsp.optString("name", "");
            if (prov.isEmpty()) prov = r.optString("lsp_name", "");
            JSONObject st = r.optJSONObject("status");
            JSONObject o = new JSONObject();
            o.put("id", r.optString("id", name));
            o.put("name", name);
            o.put("provider", prov);
            o.put("net", net);
            o.put("abbrev", st == null ? "" : st.optString("abbrev", ""));
            out.put(o);
        }
        return out;
    }

    // ------------------------------------------------------------------ notify

    /**
     * Post once per key (rate limited to ~1 per category per 3 h unless the level escalated).
     * A rate-limited item is NOT marked seen, so it can still go out later while it is fresh.
     */
    private void emit(String cat, String key, int level, String title, String body, boolean spaceWeather, boolean noRateLimit) {
        if (AlertsLogic.seen(seen, key, now)) return;
        long lastAt = prefs.getLong("rl_" + cat + "_at", 0);
        int lastLevel = prefs.getInt("rl_" + cat + "_lv", 0);
        if (!noRateLimit && !AlertsLogic.rateOk(lastAt, lastLevel, level, now)) return;
        if (post(cat, key, title, body, !spaceWeather)) {
            AlertsLogic.mark(seen, key, now, SEEN_TTL);
            prefs.edit().putLong("rl_" + cat + "_at", now).putInt("rl_" + cat + "_lv", level).apply();
        }
    }

    private boolean post(String cat, String key, String title, String body, boolean launch) {
        Context c = getApplicationContext();
        try {
            String base = launch ? "launches" : "spaceweather";
            String ch = base + (quiet ? "_quiet" : "");
            ensureChannels(c);
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, ch)
                    .setSmallIcon(R.drawable.ic_stat_periapsis)
                    .setColor(Color.parseColor("#22d3ee"))
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(true)
                    .setCategory(NotificationCompat.CATEGORY_EVENT)
                    .setPriority(quiet ? NotificationCompat.PRIORITY_LOW : (launch ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_HIGH))
                    .setContentIntent(WidgetData.openApp(c, DEEP_LINK, key.hashCode()));
            if (quiet) b.setSilent(true);
            NotificationManagerCompat.from(c).notify(key.hashCode(), b.build());
            return true;
        } catch (SecurityException e) {
            errors.add("notify (" + cat + "): " + e);
            return false;
        } catch (RuntimeException e) {
            errors.add("notify (" + cat + "): " + e);
            return false;
        }
    }

    private void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String sw = t("channel_spaceweather", "Space weather"), ln = t("channel_launches", "Launches");
        String q = " (" + t("channel_quiet", "quiet") + ")";
        nm.createNotificationChannel(new NotificationChannel("spaceweather", sw, NotificationManager.IMPORTANCE_HIGH));
        nm.createNotificationChannel(new NotificationChannel("launches", ln, NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(new NotificationChannel("spaceweather_quiet", sw + q, NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel("launches_quiet", ln + q, NotificationManager.IMPORTANCE_LOW));
    }

    // ------------------------------------------------------------------ helpers

    private String t(String key, String fallback) {
        String s = texts.optString(key, "");
        return s.isEmpty() ? fallback : s;
    }

    private static String num(double v) {
        double r = Math.round(v * 10) / 10.0;
        return r == Math.rint(r) ? String.valueOf((long) r) : String.valueOf(r);
    }

    private static double firstDouble(JSONObject o, String... keys) {
        for (String k : keys) {
            if (o.has(k) && !o.isNull(k)) {
                double d = o.optDouble(k, Double.NaN);
                if (!Double.isNaN(d)) return d;
            }
        }
        return Double.NaN;
    }

    /** SWPC "products" tables come either as [[header...], [row...]] or as an array of objects. */
    private static List<JSONObject> rows(JSONArray a) throws Exception {
        List<JSONObject> out = new ArrayList<>();
        if (a.length() == 0) return out;
        if (a.optJSONArray(0) != null) {
            JSONArray head = a.getJSONArray(0);
            for (int i = 1; i < a.length(); i++) {
                JSONArray r = a.optJSONArray(i);
                if (r == null) continue;
                JSONObject o = new JSONObject();
                for (int j = 0; j < head.length() && j < r.length(); j++) o.put(head.optString(j), r.get(j));
                out.add(o);
            }
        } else {
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o != null) out.add(o);
            }
        }
        return out;
    }

    private void loadSeen() {
        try {
            JSONObject o = new JSONObject(prefs.getString("seen", "{}"));
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String k = it.next();
                seen.put(k, o.optLong(k, 0));
            }
        } catch (Exception ignored) {
            seen.clear();
        }
    }

    private void saveSeen() {
        try {
            JSONObject o = new JSONObject();
            for (Map.Entry<String, Long> e : seen.entrySet()) o.put(e.getKey(), e.getValue());
            prefs.edit().putString("seen", o.toString()).apply();
        } catch (Exception ignored) {
            // dedupe state lost = at worst one repeated notification
        }
    }

    private static String join(List<String> l) {
        StringBuilder sb = new StringBuilder();
        for (String s : l) {
            if (sb.length() > 0) sb.append("; ");
            sb.append(s);
        }
        return sb.length() > 400 ? sb.substring(0, 400) : sb.toString();
    }

    private static String http(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(15_000);
            c.setReadTimeout(15_000);
            c.setRequestProperty("User-Agent", "Periapsis");
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code + " " + url);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > 24 * 1024 * 1024) throw new IOException("response too large");
            }
            in.close();
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }
}
