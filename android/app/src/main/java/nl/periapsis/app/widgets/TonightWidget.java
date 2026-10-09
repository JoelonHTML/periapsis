package nl.periapsis.app.widgets;

import android.content.Context;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import nl.periapsis.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/** Combined "tonight" card. 4x4. */
public class TonightWidget extends BaseWidget {
    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int w, int h, int appWidgetId) {
        long now = System.currentTimeMillis();
        JSONObject night = WidgetData.currentNight(snap, now);
        if (snap == null || night == null) return placeholder(c, snap);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_tonight);

        text(v, R.id.tv_title, WidgetData.label(snap, "tonight", "Tonight"));
        text(v, R.id.tv_main, WidgetData.label(snap, "sunset", "Sunset") + " " + hm(c, night, "start")
                + " · " + WidgetData.label(snap, "sunrise", "Sunrise") + " " + hm(c, night, "end"));
        text(v, R.id.tv_sub, WidgetData.label(snap, "dusk", "Dusk") + " " + hm(c, night, "dusk")
                + " · " + WidgetData.label(snap, "dawn", "Dawn") + " " + hm(c, night, "dawn"));

        JSONObject moon = night.optJSONObject("moon");
        show(v, R.id.moon_row, moon != null);
        if (moon != null) {
            int pct = MoonWidget.pct(moon);
            v.setImageViewBitmap(R.id.moon_img, MoonWidget.moonBitmap(128, pct / 100.0, moon.optBoolean("waxing", true)));
            text(v, R.id.tv_moon, WidgetData.label(snap, "moon", "Moon") + " " + pct + "% · "
                    + WidgetData.label(snap, "phase" + moon.optInt("idx", 0), "")
                    + "\n↑ " + hm(c, moon, "rise") + "  ↓ " + hm(c, moon, "set"));
        }

        text(v, R.id.tv_planets_h, WidgetData.label(snap, "planets", "Planets"));
        JSONArray pl = night.optJSONArray("planets");
        StringBuilder sb = new StringBuilder();
        int n = pl == null ? 0 : Math.min(4, pl.length());
        for (int i = 0; i < n; i++) {
            JSONObject p = pl.optJSONObject(i);
            if (p == null) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(p.optString("name", "")).append("  ").append(p.optString("dir", ""))
                    .append("  ").append(hm(c, p, "best"))
                    .append("  ").append(String.format(Locale.US, "%+.1f", p.optDouble("mag", 0)));
        }
        text(v, R.id.tv_planets, n == 0 ? WidgetData.label(snap, "none", "–") : sb.toString());

        // next sky event
        String ev = null;
        JSONArray evs = snap.optJSONArray("events");
        if (evs != null) {
            for (int i = 0; i < evs.length() && ev == null; i++) {
                JSONObject e = evs.optJSONObject(i);
                if (e != null && e.optLong("ms", 0) > now) {
                    ev = WidgetData.when(c, e.optLong("ms"), now) + " · " + e.optString("title", "");
                }
            }
        }
        text(v, R.id.tv_event, WidgetData.label(snap, "next_event", "Next event") + ": " + (ev == null ? "–" : ev));

        // next ISS pass
        String pass = null;
        JSONArray ps = snap.optJSONArray("passes");
        if (ps != null) {
            for (int i = 0; i < ps.length() && pass == null; i++) {
                JSONObject q = ps.optJSONObject(i);
                if (q != null && q.optLong("end", 0) > now) {
                    long st = q.optLong("start", q.optLong("max", 0));
                    pass = WidgetData.when(c, st, now) + " · " + q.optInt("maxEl", 0) + "° " + q.optString("dir", "");
                }
            }
        }
        text(v, R.id.tv_iss, WidgetData.label(snap, "iss", "ISS") + ": " + (pass == null ? "–" : pass));

        bindCommon(c, v, snap, w);
        return v;
    }
}
