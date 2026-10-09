package nl.periapsis.app.widgets;

import android.content.Context;
import android.graphics.Color;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.util.Locale;

import nl.periapsis.app.R;

/** Space weather 2x1: Kp value colored by severity. */
public class KpWidget extends BaseWidget {
    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int widthDp, int heightDp, int appWidgetId) {
        JSONObject kp = snap == null ? null : snap.optJSONObject("kp");
        if (kp == null) {
            return EventsWidget.empty(c, LaunchWidget.LINK, 50);
        }
        double val = kp.optDouble("value", 0d);
        int color = val >= 6 ? Color.parseColor("#ef4444")
                : val >= 4 ? Color.parseColor("#f59e0b") : Color.parseColor("#22c55e");
        String txt = val == Math.rint(val) ? String.valueOf((int) val) : String.format(Locale.getDefault(), "%.1f", val);
        long ms = kp.optLong("ms", 0L);
        String upd = WidgetData.label(snap, "updated", "");
        String sub = (upd.isEmpty() ? "" : upd + " ") + (ms > 0 ? WidgetData.time(c, ms) : "");
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_live_kp);
        v.setTextViewText(R.id.wl_kp, txt);
        v.setTextColor(R.id.wl_kp, color);
        v.setTextViewText(R.id.wl_label, WidgetData.label(snap, "kp", c.getString(R.string.widget_live_name_kp)));
        v.setTextViewText(R.id.wl_title, kp.optString("label", ""));
        v.setTextViewText(R.id.wl_sub, sub.trim());
        v.setOnClickPendingIntent(R.id.widget_live_root, WidgetData.openApp(c, LaunchWidget.LINK, 50));
        return v;
    }
}
