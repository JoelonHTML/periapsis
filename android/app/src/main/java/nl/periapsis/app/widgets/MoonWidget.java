package nl.periapsis.app.widgets;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import nl.periapsis.app.R;

import org.json.JSONObject;

/** Moon phase. Default 2x2; the 1x1 variant only shows the disc and the percentage. */
public class MoonWidget extends BaseWidget {

    /** Illuminated percentage 0..100 (accepts illum as 0..1 or 0..100). */
    static int pct(JSONObject moon) {
        double i = moon.optDouble("illum", 0);
        if (Double.isNaN(i)) i = 0;
        if (i <= 1.0) i *= 100;
        return (int) Math.round(Math.max(0, Math.min(100, i)));
    }

    /** Phase disc: dark disc with the lit part bounded by the limb and the terminator ellipse. */
    static Bitmap moonBitmap(int size, double illum01, boolean waxing) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float cx = size / 2f, cy = size / 2f, r = size / 2f - 3f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFF1E293B);
        cv.drawCircle(cx, cy, r, p);

        double k = Math.max(0, Math.min(1, illum01));
        if (k > 0.005) {
            cv.save();
            if (!waxing) cv.scale(-1f, 1f, cx, cy); // lit limb on the left
            p.setColor(0xFFE2E8F0);
            if (k > 0.995) {
                cv.drawCircle(cx, cy, r, p);
            } else {
                float rx = Math.max(0.5f, (float) (r * Math.abs(1.0 - 2.0 * k)));
                Path path = new Path();
                path.moveTo(cx, cy - r);
                path.arcTo(new RectF(cx - r, cy - r, cx + r, cy + r), -90f, 180f);
                path.arcTo(new RectF(cx - rx, cy - r, cx + rx, cy + r), 90f, k > 0.5 ? 180f : -180f);
                path.close();
                cv.drawPath(path, p);
            }
            cv.restore();
        }
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2f);
        p.setColor(0xFF334155);
        cv.drawCircle(cx, cy, r, p);
        return bmp;
    }

    @Override
    protected RemoteViews build(Context c, @Nullable JSONObject snap, int w, int h, int appWidgetId) {
        JSONObject night = WidgetData.currentNight(snap, System.currentTimeMillis());
        JSONObject moon = night == null ? null : night.optJSONObject("moon");
        if (snap == null || moon == null) return placeholder(c, snap);

        boolean small = w < 100 || h < 100;
        int pct = pct(moon);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_moon);
        v.setImageViewBitmap(R.id.moon_img, moonBitmap(192, pct / 100.0, moon.optBoolean("waxing", true)));
        if (small) {
            text(v, R.id.tv_main, pct + "%");
            show(v, R.id.tv_sub, false);
        } else {
            text(v, R.id.tv_main, pct + "% · " + WidgetData.label(snap, "phase" + moon.optInt("idx", 0), ""));
            show(v, R.id.tv_sub, true);
            text(v, R.id.tv_sub, "↑ " + hm(c, moon, "rise") + "  ↓ " + hm(c, moon, "set"));
        }
        show(v, R.id.tv_title, !small);
        text(v, R.id.tv_title, WidgetData.label(snap, "moon", "Moon"));
        bindCommon(c, v, snap, w);
        return v;
    }
}
