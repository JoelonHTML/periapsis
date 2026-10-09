package nl.periapsis.app.widgets;

import android.content.Context;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import nl.periapsis.app.R;

import org.json.JSONObject;

/** Sunset / sunrise with dusk and dawn. 2x1. */
public class SunWidget extends BaseWidget {
    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int w, int h, int appWidgetId) {
        JSONObject night = WidgetData.currentNight(snap, System.currentTimeMillis());
        if (snap == null || night == null) return placeholder(c, snap);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_simple);
        text(v, R.id.tv_title, WidgetData.label(snap, "sunset", "Sunset") + " · " + WidgetData.label(snap, "sunrise", "Sunrise"));
        text(v, R.id.tv_main, hm(c, night, "start") + " · " + hm(c, night, "end"));
        show(v, R.id.tv_sub, true);
        text(v, R.id.tv_sub, WidgetData.label(snap, "dusk", "Dusk") + " " + hm(c, night, "dusk")
                + " · " + WidgetData.label(snap, "dawn", "Dawn") + " " + hm(c, night, "dawn"));
        bindCommon(c, v, snap, w);
        return v;
    }
}
