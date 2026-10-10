package nl.periapsis.app.alerts;

import java.util.HashMap;
import java.util.Map;

/**
 * Plain-Java checks for AlertsLogic (no JUnit needed). Run:
 *   javac -d /tmp/alt android/app/src/main/java/nl/periapsis/app/alerts/AlertsLogic.java android/app/src/test/java/nl/periapsis/app/alerts/AlertsLogicTest.java
 *   java -cp /tmp/alt nl.periapsis.app.alerts.AlertsLogicTest
 */
public class AlertsLogicTest {
    static int fails = 0, n = 0;

    static void eq(String what, Object got, Object want) {
        n++;
        if (!String.valueOf(got).equals(String.valueOf(want))) {
            fails++;
            System.out.println("FAIL " + what + ": got " + got + " want " + want);
        }
    }

    static String msg(String head, String second) {
        return "Space Weather Message Code: X\r\nSerial Number: 1\r\nIssue Time: 2026 Oct 03 1234 UTC\r\n\r\n" + head + "\r\n" + second + "\r\n\r\nNOAA Space Weather Scale descriptions can be found at\r\nwww.swpc.noaa.gov/noaa-scales-explanation";
    }

    public static void main(String[] a) {
        // classify
        AlertsLogic.Alert w = AlertsLogic.classify("WATA20", msg("WATCH: Geomagnetic Storm Category G2 Predicted", "Highest Storm Level Predicted by Day: G2"));
        eq("watch cat", w.category, "watch"); eq("watch lvl", w.level, 2);
        w = AlertsLogic.classify("K06W", msg("WARNING: Geomagnetic K-index of 6 expected", "Valid From: 2026 Oct 03 1300 UTC"));
        eq("warn cat", w.category, "watch"); eq("warn lvl", w.level, 2);
        w = AlertsLogic.classify("K05A", msg("ALERT: Geomagnetic K-index of 5", "Threshold Reached: 2026 Oct 03 1200 UTC"));
        eq("obs ignored", w.category, "ignore");
        w = AlertsLogic.classify("K07W", "garbage without headline");
        eq("product fallback", w.category + w.level, "watch3");
        w = AlertsLogic.classify("XM5A", msg("ALERT: X-ray Flux exceeded M5", "Threshold Reached: 2026 Oct 03 1200 UTC"));
        eq("xray ignored", w.category, "ignore");
        w = AlertsLogic.classify("ALTTP2", msg("ALERT: Type II Radio Emission", "Event Begin Time: 2026 Oct 03 1200 UTC"));
        eq("type II = cme", w.category, "cme");
        w = AlertsLogic.classify("ALTTP3", msg("ALERT: Type III Radio Emission", "x"));
        eq("type III not cme", w.category, "ignore");
        w = AlertsLogic.classify("ALTTP4", msg("ALERT: Type IV Radio Emission", "x"));
        eq("type IV = cme", w.category, "cme");
        w = AlertsLogic.classify("RADIO", msg("ALERT: 10cm Radio Burst", "Observed Flux: 500 sfu"));
        eq("10cm radio", w.category, "radio");
        w = AlertsLogic.classify("SUM", msg("SUMMARY: Geomagnetic Storm Category G1", "x"));
        eq("summary ignored", w.category, "ignore");
        w = AlertsLogic.classify("CANCEL", msg("CANCEL WATCH: Geomagnetic Storm Category G1", "x"));
        eq("cancel ignored", w.category, "ignore");
        w = AlertsLogic.classify(null, null);
        eq("null safe", w.category, "ignore");
        eq("headline", AlertsLogic.headline(msg("WATCH: Geomagnetic Storm Category G1 Predicted", "Highest Storm Level Predicted by Day: G1")),
                "WATCH: Geomagnetic Storm Category G1 Predicted - Highest Storm Level Predicted by Day: G1");

        // Kp -> G
        eq("g4.67", AlertsLogic.gScale(4.67), 0); eq("g5", AlertsLogic.gScale(5), 1); eq("g6.33", AlertsLogic.gScale(6.33), 2);
        eq("g9", AlertsLogic.gScale(9), 5); eq("lat g1", AlertsLogic.kpLatitude(1), 58);

        // aurora lookup
        eq("near same", AlertsLogic.nearCell(5, 52, 52.2, 5.3), true);
        eq("near neighbour", AlertsLogic.nearCell(6, 53, 52.2, 5.3), true);
        eq("not near", AlertsLogic.nearCell(8, 52, 52.2, 5.3), false);
        eq("lon wrap west", AlertsLogic.nearCell(359, 60, 60.0, -0.4), true);
        eq("lon wrap -1", AlertsLogic.nearCell(359, 60, 60.0, 0.4), true);
        eq("lon wrap far", AlertsLogic.nearCell(180, 60, 60.0, 0.4), false);
        eq("wrapLon -10", AlertsLogic.wrapLon(-10), 350);
        long noonUtc = AlertsLogic.parseUtc("2026-10-03T12:00:00Z");
        eq("day at lon 0", AlertsLogic.darkish(noonUtc, 0), false);
        eq("night at lon 180", AlertsLogic.darkish(noonUtc, 180), true);
        eq("night at 22:00 NL", AlertsLogic.darkish(AlertsLogic.parseUtc("2026-10-03 20:00:00"), 5), true);
        eq("nightId same night", AlertsLogic.nightId(AlertsLogic.parseUtc("2026-10-03 20:00:00"), 5) == AlertsLogic.nightId(AlertsLogic.parseUtc("2026-10-04 03:00:00"), 5), true);
        eq("nightId next night", AlertsLogic.nightId(AlertsLogic.parseUtc("2026-10-03 20:00:00"), 5) == AlertsLogic.nightId(AlertsLogic.parseUtc("2026-10-04 20:00:00"), 5), false);
        eq("tier below", AlertsLogic.auroraTier(20, 30), 0); eq("tier1", AlertsLogic.auroraTier(30, 30), 1);
        eq("tier2", AlertsLogic.auroraTier(55, 30), 2); eq("tier3", AlertsLogic.auroraTier(90, 30), 3);

        // flares
        eq("M5 >= M", AlertsLogic.flareMeets("M5.2", "M"), true);
        eq("C9 < M", AlertsLogic.flareMeets("C9.9", "M"), false);
        eq("M9 < X", AlertsLogic.flareMeets("M9.9", "X"), false);
        eq("X1 >= X", AlertsLogic.flareMeets("X1.0", "X"), true);
        eq("X1 >= M", AlertsLogic.flareMeets("X1.0", "M"), true);
        eq("off", AlertsLogic.flareMeets("X9", "off"), false);
        eq("M5 vs M5", AlertsLogic.flareMeets("M4.9", "M5"), false);
        eq("bad class", AlertsLogic.flareMeets("hello", "M"), false);
        eq("rank order", AlertsLogic.flareRank("X1") > AlertsLogic.flareRank("M9.9"), true);

        // launches
        long now = 1_000_000_000_000L;
        eq("due in 30", AlertsLogic.launchDue(now + 30 * 60000L, now, 60), true);
        eq("not yet", AlertsLogic.launchDue(now + 90 * 60000L, now, 60), false);
        eq("past", AlertsLogic.launchDue(now - 10 * 60000L, now, 60), false);
        eq("status go", AlertsLogic.launchStatusOk("Go"), true); eq("status tbd", AlertsLogic.launchStatusOk("TBD"), false);

        // quiet hours
        eq("quiet 23:30", AlertsLogic.inQuiet(23 * 60 + 30, "23:00", "07:00"), true);
        eq("quiet 03:00", AlertsLogic.inQuiet(3 * 60, "23:00", "07:00"), true);
        eq("quiet 12:00", AlertsLogic.inQuiet(12 * 60, "23:00", "07:00"), false);
        eq("quiet 07:00", AlertsLogic.inQuiet(7 * 60, "23:00", "07:00"), false);
        eq("quiet same-day", AlertsLogic.inQuiet(9 * 60, "08:00", "10:00"), true);
        eq("quiet bad", AlertsLogic.inQuiet(9 * 60, "x", "10:00"), false);

        // text
        eq("fill", AlertsLogic.fill("Kp {kp} - {g} {zz}", "kp", "7", "g", "G3"), "Kp 7 - G3 {zz}");

        // dedupe / rate
        Map<String, Long> m = new HashMap<>();
        AlertsLogic.mark(m, "k", now, 1000);
        eq("seen", AlertsLogic.seen(m, "k", now + 500), true);
        eq("expired", AlertsLogic.seen(m, "k", now + 1500), false);
        AlertsLogic.prune(m, now + 1500);
        eq("pruned", m.size(), 0);
        eq("rate first", AlertsLogic.rateOk(0, 0, 1, now), true);
        eq("rate blocked", AlertsLogic.rateOk(now - 3600000L, 2, 2, now), false);
        eq("rate escalation", AlertsLogic.rateOk(now - 3600000L, 2, 3, now), true);
        eq("rate after 3h", AlertsLogic.rateOk(now - 4 * 3600000L, 2, 1, now), true);

        // time parse
        eq("parse space", AlertsLogic.parseUtc("2026-10-03 12:34:56.789"), 1791030896000L);
        eq("parse iso", AlertsLogic.parseUtc("2026-10-03T12:34:56Z"), 1791030896000L);
        eq("parse noSec", AlertsLogic.parseUtc("2026-10-03T12:34:00"), 1791030840000L);
        eq("parse bad", AlertsLogic.parseUtc("nope"), -1L);

        System.out.println(n + " checks, " + fails + " failed");
        if (fails > 0) System.exit(1);
    }
}
