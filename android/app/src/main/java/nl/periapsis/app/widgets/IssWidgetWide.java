package nl.periapsis.app.widgets;

import android.content.Context;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.util.List;

import nl.periapsis.app.R;

/** ISS passes 4x1: chronometer countdown plus the following pass. */
public class IssWidgetWide extends BaseWidget {
    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int widthDp, int heightDp, int appWidgetId) {
        List<JSONObject> list = EventsWidget.upcoming(snap == null ? null : snap.optJSONArray("passes"), "end", 2);
        if (list.isEmpty()) {
            return EventsWidget.empty(c, IssWidget.LINK, 30);
        }
        JSONObject p = list.get(0);
        long start = p.optLong("start");
        long now = System.currentTimeMillis();
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_live_iss_wide);
        v.setTextViewText(R.id.wl_label, WidgetData.label(snap, "iss", c.getString(R.string.widget_live_name_iss_wide)));
        if (start > now) {
            v.setViewVisibility(R.id.wl_chrono, View.VISIBLE);
            v.setViewVisibility(R.id.wl_now, View.GONE);
            v.setChronometerCountDown(R.id.wl_chrono, true);
            v.setChronometer(R.id.wl_chrono, SystemClock.elapsedRealtime() + (start - now), null, true);
        } else {
            v.setViewVisibility(R.id.wl_chrono, View.GONE);
            v.setViewVisibility(R.id.wl_now, View.VISIBLE);
            v.setTextViewText(R.id.wl_now, c.getString(R.string.widget_live_now));
        }
        v.setTextViewText(R.id.wl_sub, EventsWidget.day(c, start) + " " + WidgetData.time(c, start)
                + " · " + c.getString(R.string.widget_live_max_el, p.optInt("maxEl")));
        if (list.size() > 1) {
            long qs = list.get(1).optLong("start");
            v.setViewVisibility(R.id.wl_extra, View.VISIBLE);
            v.setTextViewText(R.id.wl_extra, c.getString(R.string.widget_live_following,
                    EventsWidget.day(c, qs) + " " + WidgetData.time(c, qs)));
        } else {
            v.setViewVisibility(R.id.wl_extra, View.GONE);
        }
        v.setOnClickPendingIntent(R.id.widget_live_root, WidgetData.openApp(c, IssWidget.LINK, 30));
        return v;
    }
}
