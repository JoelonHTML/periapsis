package nl.periapsis.app.widgets;

import android.content.Context;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.util.List;

import nl.periapsis.app.R;

/** Next ISS pass 2x1: start time, max elevation, direction. */
public class IssWidget extends BaseWidget {
    static final String LINK = "periapsis://open/explore/passes";

    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int widthDp, int heightDp, int appWidgetId) {
        List<JSONObject> list = EventsWidget.upcoming(snap == null ? null : snap.optJSONArray("passes"), "end", 1);
        if (list.isEmpty()) {
            return EventsWidget.empty(c, LINK, 20);
        }
        JSONObject p = list.get(0);
        long start = p.optLong("start");
        String dir = p.optString("dir", "");
        String sub = c.getString(R.string.widget_live_max_el, p.optInt("maxEl")) + (dir.isEmpty() ? "" : " · " + dir);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_live_iss);
        v.setTextViewText(R.id.wl_label, WidgetData.label(snap, "iss", c.getString(R.string.widget_live_name_iss)));
        v.setTextViewText(R.id.wl_title, WidgetData.time(c, start));
        v.setTextViewText(R.id.wl_sub, sub);
        v.setTextViewText(R.id.wl_rel, EventsWidget.rel(c, start));
        v.setOnClickPendingIntent(R.id.widget_live_root, WidgetData.openApp(c, LINK, 20));
        return v;
    }
}
