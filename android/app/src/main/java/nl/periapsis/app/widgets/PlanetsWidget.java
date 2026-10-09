package nl.periapsis.app.widgets;

import android.content.Context;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import nl.periapsis.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/** Planets tonight. Default 2x2; layout adapts to the real size (simple card when short, list otherwise). */
public class PlanetsWidget extends BaseWidget {
    private static final int[] ROW = {R.id.row1, R.id.row2, R.id.row3, R.id.row4};
    private static final int[] NAME = {R.id.name1, R.id.name2, R.id.name3, R.id.name4};
    private static final int[] MID = {R.id.mid1, R.id.mid2, R.id.mid3, R.id.mid4};
    private static final int[] RIGHT = {R.id.right1, R.id.right2, R.id.right3, R.id.right4};

    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int w, int h, int appWidgetId) {
        long now = System.currentTimeMillis();
        JSONObject night = WidgetData.currentNight(snap, now);
        if (snap == null || night == null) return placeholder(c, snap);
        JSONArray pl = night.optJSONArray("planets");
        int n = pl == null ? 0 : pl.length();
        String title = WidgetData.label(snap, "tonight", "Tonight");
        String planetsWord = WidgetData.label(snap, "planets", "Planets");

        if (h < 80) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_simple);
            text(v, R.id.tv_title, title);
            if (n == 0) {
                text(v, R.id.tv_main, WidgetData.label(snap, "none", "–"));
            } else {
                text(v, R.id.tv_main, n + " " + planetsWord.toLowerCase(Locale.getDefault())
                        + " · " + pl.optJSONObject(0).optString("name", ""));
            }
            show(v, R.id.tv_sub, false);
            bindCommon(c, v, snap, w);
            return v;
        }

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        boolean wide = w >= 200;
        boolean foot = h >= 150;
        text(v, R.id.tv_title, title + " · " + planetsWord.toLowerCase(Locale.getDefault()));
        int avail = h - 24 - 20 - (foot ? 34 : 0);
        int rows = Math.max(1, Math.min(4, avail / 20));
        if (n < rows) rows = n;
        for (int i = 0; i < 4; i++) {
            boolean on = i < rows;
            show(v, ROW[i], on);
            if (!on) continue;
            JSONObject p = pl.optJSONObject(i);
            if (p == null) p = new JSONObject();
            text(v, NAME[i], p.optString("name", ""));
            String dir = p.optString("dir", "");
            if (wide) {
                String aid = p.optString("aid", "");
                String mid = String.format(Locale.US, "%+.1f", p.optDouble("mag", 0));
                if (!dir.isEmpty()) mid += " · " + dir;
                if (!aid.isEmpty()) mid += " · " + WidgetData.label(snap, aid, aid);
                text(v, MID[i], mid);
                text(v, RIGHT[i], hm(c, p, "from") + "–" + hm(c, p, "to"));
            } else {
                text(v, MID[i], dir);
                text(v, RIGHT[i], hm(c, p, "best"));
            }
        }
        show(v, R.id.tv_empty, n == 0);
        text(v, R.id.tv_empty, WidgetData.label(snap, "none", "–"));

        show(v, R.id.tv_foot, foot);
        if (foot) {
            JSONObject moon = night.optJSONObject("moon");
            StringBuilder sb = new StringBuilder();
            if (moon != null) {
                sb.append(WidgetData.label(snap, "moon", "Moon")).append(' ')
                        .append(MoonWidget.pct(moon)).append("% · ")
                        .append(WidgetData.label(snap, "phase" + moon.optInt("idx", 0), ""));
            }
            if (night.optLong("dusk", 0) > 0 || night.optLong("dawn", 0) > 0) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(WidgetData.label(snap, "dusk", "Dusk")).append(' ').append(hm(c, night, "dusk"))
                        .append(" · ").append(WidgetData.label(snap, "dawn", "Dawn")).append(' ').append(hm(c, night, "dawn"));
            }
            text(v, R.id.tv_foot, sb.toString());
        }
        bindCommon(c, v, snap, w);
        return v;
    }
}
