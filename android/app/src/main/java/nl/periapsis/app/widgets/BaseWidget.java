package nl.periapsis.app.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import nl.periapsis.app.R;

import org.json.JSONObject;

/**
 * Base for all Periapsis widgets. Every layout root is a FrameLayout (id widget_root) whose first child is the
 * ImageView widget_bg (background with adjustable alpha), followed by the content.
 */
public abstract class BaseWidget extends AppWidgetProvider {
    protected static final String DEEP_LINK = "periapsis://open/sky/tonight";

    protected abstract RemoteViews build(Context c, @Nullable JSONObject snap, int widthDp, int heightDp, int appWidgetId);

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] appWidgetIds) {
        for (int id : appWidgetIds) update(context, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, mgr, appWidgetId, newOptions);
        update(context, mgr, appWidgetId);
    }

    private void update(Context c, AppWidgetManager mgr, int id) {
        JSONObject snap = WidgetData.load(c);
        int w = 110, h = 110;
        try {
            Bundle o = mgr.getAppWidgetOptions(id);
            if (o != null) {
                int ow = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
                int oh = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
                if (ow > 0) w = ow;
                if (oh > 0) h = oh;
            }
        } catch (Exception ignored) {
            // keep defaults
        }
        RemoteViews rv = null;
        if (snap != null) {
            try {
                rv = build(c, snap, w, h, id);
            } catch (Exception e) {
                rv = null;
            }
        }
        if (rv == null) rv = placeholder(c, snap);
        applyBg(rv, snap);
        mgr.updateAppWidget(id, rv);
    }

    protected static void applyBg(RemoteViews v, @Nullable JSONObject snap) {
        v.setInt(R.id.widget_bg, "setImageAlpha", WidgetData.alpha255(snap));
    }

    protected static RemoteViews placeholder(Context c, @Nullable JSONObject snap) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_placeholder);
        v.setOnClickPendingIntent(R.id.widget_root, WidgetData.openApp(c, DEEP_LINK, 100));
        return v;
    }

    // ---- small helpers for the sky widgets ----

    protected static void show(RemoteViews v, int id, boolean on) {
        v.setViewVisibility(id, on ? View.VISIBLE : View.GONE);
    }

    protected static void text(RemoteViews v, int id, CharSequence t) {
        v.setTextViewText(id, t);
    }

    /** Tap target + "updated HH:mm" text (view tv_updated, hidden when narrow). */
    protected static void bindCommon(Context c, RemoteViews v, JSONObject snap, int widthDp) {
        v.setOnClickPendingIntent(R.id.widget_root, WidgetData.openApp(c, DEEP_LINK, 100));
        long gen = snap.optLong("gen", 0);
        boolean on = gen > 0 && widthDp >= 150;
        show(v, R.id.tv_updated, on);
        if (on) text(v, R.id.tv_updated, WidgetData.label(snap, "updated", "Updated") + " " + WidgetData.time(c, gen));
    }

    /** Formatted time stored under key, or an en dash. */
    protected static String hm(Context c, JSONObject o, String key) {
        long t = o == null ? 0 : o.optLong(key, 0);
        return t > 0 ? WidgetData.time(c, t) : "–";
    }
}
