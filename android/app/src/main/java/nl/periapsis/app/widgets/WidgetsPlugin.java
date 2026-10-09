package nl.periapsis.app.widgets;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge for the home-screen widgets: pushes the data snapshot and offers "add to home screen". */
@CapacitorPlugin(name = "PeriapsisWidgets")
public class WidgetsPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("no-json");
            return;
        }
        Context c = getContext();
        WidgetData.save(c, json);
        WidgetData.refreshAll(c);
        call.resolve();
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        boolean pin = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                pin = AppWidgetManager.getInstance(getContext()).isRequestPinAppWidgetSupported();
            } catch (Exception ignored) {
                pin = false;
            }
        }
        JSObject ret = new JSObject();
        ret.put("pin", pin);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPin(PluginCall call) {
        String kind = call.getString("kind");
        Class<?> cls = kind == null ? null : WidgetData.KINDS.get(kind);
        boolean ok = false;
        if (cls != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Context c = getContext();
                AppWidgetManager mgr = AppWidgetManager.getInstance(c);
                if (mgr.isRequestPinAppWidgetSupported()) {
                    ok = mgr.requestPinAppWidget(new ComponentName(c, cls), null, null);
                }
            } catch (Exception ignored) {
                ok = false;
            }
        }
        JSObject ret = new JSObject();
        ret.put("ok", ok);
        call.resolve(ret);
    }
}
