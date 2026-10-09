package nl.periapsis.app.widgets;

import android.content.Context;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONObject;

import nl.periapsis.app.R;

/** Next launch 4x1: name, provider, T- chronometer countdown, date/time. */
public class LaunchWidget extends BaseWidget {
    static final String LINK = "periapsis://open/sky/live";

    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int widthDp, int heightDp, int appWidgetId) {
        JSONObject l = snap == null ? null : snap.optJSONObject("launch");
        long ms = l == null ? 0L : l.optLong("ms");
        long now = System.currentTimeMillis();
        if (l == null || ms < now) {
            return EventsWidget.empty(c, LINK, 40);
        }
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_live_launch);
        v.setTextViewText(R.id.wl_label, WidgetData.label(snap, "launch", c.getString(R.string.widget_live_name_launch)));
        v.setTextViewText(R.id.wl_title, l.optString("name", ""));
        v.setTextViewText(R.id.wl_sub, l.optString("provider", ""));
        v.setTextViewText(R.id.wl_date, EventsWidget.dateTime(c, ms));
        v.setViewVisibility(R.id.wl_now, View.GONE);
        v.setChronometerCountDown(R.id.wl_chrono, true);
        v.setChronometer(R.id.wl_chrono, SystemClock.elapsedRealtime() + (ms - now), null, true);
        v.setOnClickPendingIntent(R.id.widget_live_root, WidgetData.openApp(c, LINK, 40));
        return v;
    }
}
