package nl.periapsis.app.widgets;

import android.content.Context;
import android.text.format.DateUtils;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

import nl.periapsis.app.R;

/** Next sky event (2x2); switches to a 4-row list layout when wide. Also hosts shared helpers. */
public class EventsWidget extends BaseWidget {
    static final String LINK = "periapsis://open/sky/events";

    private static final int[] ROWS = {R.id.wl_row1, R.id.wl_row2, R.id.wl_row3, R.id.wl_row4};
    private static final int[] WHEN = {R.id.wl_when1, R.id.wl_when2, R.id.wl_when3, R.id.wl_when4};
    private static final int[] NAME = {R.id.wl_name1, R.id.wl_name2, R.id.wl_name3, R.id.wl_name4};

    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int widthDp, int heightDp, int appWidgetId) {
        List<JSONObject> list = upcoming(snap == null ? null : snap.optJSONArray("events"), "ms", 4);
        if (list.isEmpty()) {
            return empty(c, LINK, 10);
        }
        String label = WidgetData.label(snap, "next_event", c.getString(R.string.widget_live_name_events));
        if (widthDp >= 200) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_live_events_list);
            v.setTextViewText(R.id.wl_label, label);
            int max = Math.max(1, Math.min(4, (heightDp - 30) / 22));
            for (int i = 0; i < 4; i++) {
                if (i < list.size() && i < max) {
                    v.setViewVisibility(ROWS[i], View.VISIBLE);
                    v.setTextViewText(WHEN[i], dateTime(c, list.get(i).optLong("ms")));
                    v.setTextViewText(NAME[i], list.get(i).optString("title", ""));
                } else {
                    v.setViewVisibility(ROWS[i], View.GONE);
                }
            }
            v.setOnClickPendingIntent(R.id.widget_live_root, WidgetData.openApp(c, LINK, 11));
            return v;
        }
        JSONObject e = list.get(0);
        long ms = e.optLong("ms");
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_live_events);
        v.setTextViewText(R.id.wl_label, label);
        v.setTextViewText(R.id.wl_title, e.optString("title", ""));
        v.setTextViewText(R.id.wl_date, dateTime(c, ms));
        v.setTextViewText(R.id.wl_rel, rel(c, ms));
        v.setOnClickPendingIntent(R.id.widget_live_root, WidgetData.openApp(c, LINK, 10));
        return v;
    }

    /** Entries whose key (ms or end) is not in the past, at most max. */
    static List<JSONObject> upcoming(@Nullable JSONArray a, String key, int max) {
        List<JSONObject> out = new ArrayList<>();
        if (a == null) return out;
        long now = System.currentTimeMillis();
        for (int i = 0; i < a.length() && out.size() < max; i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && o.optLong(key, 0L) >= now) out.add(o);
        }
        return out;
    }

    static RemoteViews empty(Context c, String link, int requestCode) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_live_empty);
        v.setTextViewText(R.id.wl_title, c.getString(R.string.widget_live_empty));
        v.setOnClickPendingIntent(R.id.widget_live_root, WidgetData.openApp(c, link, requestCode));
        return v;
    }

    /** Localized "Mon, Oct 5, 21:30". */
    static String dateTime(Context c, long ms) {
        return day(c, ms) + ", " + WidgetData.time(c, ms);
    }

    static String day(Context c, long ms) {
        return DateUtils.formatDateTime(c, ms, DateUtils.FORMAT_SHOW_DATE | DateUtils.FORMAT_ABBREV_ALL
                | DateUtils.FORMAT_SHOW_WEEKDAY);
    }

    /** "in 5 min" / "in 3 h" / "in 3 d". */
    static String rel(Context c, long ms) {
        long diff = ms - System.currentTimeMillis();
        if (diff < 60000L) return c.getString(R.string.widget_live_now);
        long min = diff / 60000L;
        if (min < 60) return c.getString(R.string.widget_live_in_min, (int) min);
        long h = diff / 3600000L;
        if (h < 24) return c.getString(R.string.widget_live_in_h, (int) h);
        return c.getString(R.string.widget_live_in_d, (int) (diff / 86400000L));
    }
}
