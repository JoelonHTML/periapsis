package nl.periapsis.app.alerts;

import java.util.Calendar;
import java.util.Iterator;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure decision logic for the background alerts (no Android deps, unit-testable with plain javac). */
public final class AlertsLogic {
    private AlertsLogic() {}

    public static final long HOUR = 3600_000L;
    public static final long RATE_MS = 3 * HOUR;

    /** A classified SWPC alert. category: watch | cme | radio | ignore. */
    public static final class Alert {
        public final String category;
        public final int level;      // G level for watches (0 when unknown)
        public final String headline;
        public Alert(String category, int level, String headline) {
            this.category = category;
            this.level = level;
            this.headline = headline;
        }
    }

    private static final Pattern HEAD = Pattern.compile("^\\s*(WATCH|WARNING|EXTENDED WARNING|ALERT|CONTINUED ALERT|SUMMARY|CANCEL WATCH)\\s*:.*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern GCAT = Pattern.compile("Category\\s+G\\s*([1-5])", Pattern.CASE_INSENSITIVE);
    private static final Pattern KIDX = Pattern.compile("K-index\\s+of\\s+([0-9])", Pattern.CASE_INSENSITIVE);
    private static final Pattern KPROD = Pattern.compile("^K0?([4-9])([WA])$");
    private static final Pattern CME = Pattern.compile("coronal mass|\\bcme\\b|\\btype (ii|iv)\\b");
    private static final Pattern FLARE = Pattern.compile("^\\s*([ABCMX])\\s*(\\d+(?:\\.\\d+)?)\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern HM = Pattern.compile("^\\s*(\\d{1,2}):(\\d{2})\\s*$");
    private static final Pattern TS = Pattern.compile("^\\s*(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})(?::(\\d{2}))?(?:\\.\\d+)?\\s*(?:Z|[+-]00:?00)?\\s*$");

    /** First "WATCH:/WARNING:/ALERT:/..." line plus the line after it (trimmed), or "" when absent. */
    public static String headline(String message) {
        if (message == null) return "";
        String[] lines = message.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            if (HEAD.matcher(lines[i]).matches()) {
                String s = lines[i].trim();
                if (i + 1 < lines.length && !lines[i + 1].trim().isEmpty()) s += " - " + lines[i + 1].trim();
                return s.length() > 220 ? s.substring(0, 220) : s;
            }
        }
        return "";
    }

    /**
     * Classify one alerts.json entry. The headline text is what is trusted; SWPC product codes
     * (K0nW warning, K0nA alert, WAT* watch) are only a fallback. Observed K alerts, X-ray flux alerts and
     * summaries are "ignore": the Kp and GOES flare feeds cover them (so nothing is notified twice).
     */
    public static Alert classify(String productId, String message) {
        String head = headline(message);
        String h = head.isEmpty() ? (message == null ? "" : message) : head;
        String hl = h.toLowerCase();
        String pid = productId == null ? "" : productId.trim().toUpperCase();
        String type = "";
        Matcher m = HEAD.matcher(head);
        if (m.matches()) type = m.group(1).toUpperCase();
        if (type.equals("SUMMARY") || type.equals("CANCEL WATCH")) return new Alert("ignore", 0, head);

        if (CME.matcher(hl).find()) {
            return new Alert("cme", 0, head);
        }
        if (hl.contains("x-ray")) return new Alert("ignore", 0, head);
        if (hl.contains("10cm radio") || hl.contains("radio burst") || hl.contains("radio blackout")) {
            return new Alert("radio", 0, head);
        }
        Matcher kp = KPROD.matcher(pid);
        boolean kProd = kp.matches();
        boolean watchProduct = pid.startsWith("WAT");
        if (hl.contains("geomagnetic") || watchProduct || kProd) {
            int level = 0;
            Matcher g = GCAT.matcher(h), k = KIDX.matcher(h);
            if (g.find()) level = Integer.parseInt(g.group(1));
            else if (k.find()) level = Math.max(0, Integer.parseInt(k.group(1)) - 4);
            else if (kProd) level = Integer.parseInt(kp.group(1)) - 4;
            boolean observed = type.equals("ALERT") || type.equals("CONTINUED ALERT") || (type.isEmpty() && kProd && kp.group(2).equals("A"));
            boolean forecast = type.equals("WATCH") || type.equals("WARNING") || type.equals("EXTENDED WARNING")
                    || (type.isEmpty() && (watchProduct || (kProd && kp.group(2).equals("W"))));
            if (!observed && forecast && level >= 1) return new Alert("watch", level, head);
        }
        return new Alert("ignore", 0, head);
    }

    // ---- Kp ----
    /** NOAA G-scale: Kp 5 = G1 ... Kp 9 = G5; below 5 = 0. */
    public static int gScale(double kp) {
        return kp >= 5 ? Math.min(5, (int) Math.floor(kp) - 4) : 0;
    }

    /** Rough southern edge of the visible aurora (geographic latitude, Europe-ish) for a G level. */
    public static int kpLatitude(int g) {
        switch (g) {
            case 1: return 58;
            case 2: return 55;
            case 3: return 52;
            case 4: return 48;
            default: return 45;
        }
    }

    // ---- Aurora (OVATION 1-degree grid, lon 0..359) ----
    public static int wrapLon(double lon) {
        return (((int) Math.round(lon)) % 360 + 360) % 360;
    }

    /** True when grid cell (cLon, cLat) is the site's cell or one of its 8 neighbours (lon wraps at 360). */
    public static boolean nearCell(int cLon, int cLat, double siteLat, double siteLon) {
        int lo = wrapLon(siteLon), la = (int) Math.round(siteLat);
        int dLon = Math.abs(cLon - lo);
        dLon = Math.min(dLon, 360 - dLon);
        return dLon <= 1 && Math.abs(cLat - la) <= 1;
    }

    /** Local solar hour (0..24) at lon for a UTC instant. */
    public static double solarHour(long utcMs, double lon) {
        double h = (((utcMs % 86400000L) + 86400000L) % 86400000L) / 3600000.0 + lon / 15.0;
        return ((h % 24) + 24) % 24;
    }

    /** "Dark-ish": local solar time 18:00-06:00. */
    public static boolean darkish(long utcMs, double lon) {
        double h = solarHour(utcMs, lon);
        return h >= 18 || h < 6;
    }

    /** Night id (changes at local solar noon) for once-per-night dedupe. */
    public static long nightId(long utcMs, double lon) {
        return Math.floorDiv(utcMs + (long) (lon / 15.0 * HOUR) - 12 * HOUR, 86400000L);
    }

    /** Escalation tier for an aurora chance: 0 = below threshold, 1 = at/above it, 2 = >= 50 %, 3 = >= 70 %. */
    public static int auroraTier(int pct, int min) {
        if (pct < Math.max(1, min)) return 0;
        return pct >= 70 ? 3 : pct >= 50 ? 2 : 1;
    }

    // ---- Flares ----
    /** A..X letter + magnitude as one comparable number (A1=1001 ... M5.2=4005.2 ... X1=5001); -1 if not a class. */
    public static double flareRank(String cls) {
        if (cls == null) return -1;
        Matcher m = FLARE.matcher(cls);
        if (!m.matches()) return -1;
        int letter = "ABCMX".indexOf(m.group(1).toUpperCase()) + 1;
        return letter * 1000 + Double.parseDouble(m.group(2));
    }

    /** min: "M" / "X" (whole class) or a full class like "M5"; "off"/garbage = never. */
    public static boolean flareMeets(String cls, String min) {
        double r = flareRank(cls);
        if (r < 0 || min == null) return false;
        String mm = min.trim().toUpperCase();
        double t = flareRank(mm);
        if (t < 0) t = flareRank(mm + "1");
        return t >= 0 && r >= t;
    }

    // ---- Launches ----
    public static boolean launchStatusOk(String abbrev) {
        String a = abbrev == null ? "" : abbrev.trim().toLowerCase();
        return a.equals("go") || a.equals("tbc");
    }

    /** True when liftoff (net) is still ahead (1 min grace) and within leadMin minutes. */
    public static boolean launchDue(long net, long now, int leadMin) {
        return net > 0 && net > now - 60_000L && net - now <= leadMin * 60_000L;
    }

    // ---- Quiet hours / text ----
    public static int parseHm(String s) {
        if (s == null) return -1;
        Matcher m = HM.matcher(s);
        if (!m.matches()) return -1;
        int h = Integer.parseInt(m.group(1)), mi = Integer.parseInt(m.group(2));
        return h > 23 || mi > 59 ? -1 : h * 60 + mi;
    }

    public static boolean inQuiet(int nowMin, String from, String to) {
        int f = parseHm(from), t = parseHm(to);
        if (f < 0 || t < 0 || f == t) return false;
        return f < t ? (nowMin >= f && nowMin < t) : (nowMin >= f || nowMin < t);
    }

    /** Replace {key} placeholders; kv = key1, value1, key2, value2 ... Unknown placeholders stay untouched. */
    public static String fill(String template, String... kv) {
        String s = template == null ? "" : template;
        for (int i = 0; i + 1 < kv.length; i += 2) s = s.replace("{" + kv[i] + "}", kv[i + 1] == null ? "" : kv[i + 1]);
        return s;
    }

    // ---- Dedupe ----
    public static boolean seen(Map<String, Long> m, String key, long now) {
        Long exp = m.get(key);
        return exp != null && exp > now;
    }

    public static void mark(Map<String, Long> m, String key, long now, long ttlMs) {
        m.put(key, now + ttlMs);
    }

    public static void prune(Map<String, Long> m, long now) {
        Iterator<Map.Entry<String, Long>> it = m.entrySet().iterator();
        while (it.hasNext()) if (it.next().getValue() <= now) it.remove();
    }

    /** Max ~1 notification per category per 3 h unless the level escalated. */
    public static boolean rateOk(long lastAt, int lastLevel, int level, long now) {
        return lastAt <= 0 || now - lastAt >= RATE_MS || level > lastLevel;
    }

    // ---- Time ----
    /** "2026-10-03 12:34:56(.789)" or ISO "...T...Z" (UTC; other offsets unsupported) -> epoch ms, or -1. */
    public static long parseUtc(String s) {
        if (s == null) return -1;
        Matcher m = TS.matcher(s);
        if (!m.matches()) return -1;
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        c.clear();
        c.set(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)) - 1, Integer.parseInt(m.group(3)),
                Integer.parseInt(m.group(4)), Integer.parseInt(m.group(5)), m.group(6) == null ? 0 : Integer.parseInt(m.group(6)));
        return c.getTimeInMillis();
    }
}
