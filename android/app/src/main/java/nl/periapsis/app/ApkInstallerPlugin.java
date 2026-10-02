package nl.periapsis.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app update: downloads the release APK from GitHub into the app cache and hands it to Android's package installer
 * (the system "Install / Update?" dialog). Nothing is installed without the user confirming that dialog.
 * JS side: src/lib/apk-install.ts
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("bad-url");
            return;
        }
        final Context ctx = getContext();

        // Android 8+: the user must allow this app to install packages once (settings screen "Install unknown apps").
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            JSObject r = new JSObject();
            r.put("status", "needs-permission");
            call.resolve(r);
            return;
        }

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File dir = new File(ctx.getCacheDir(), "apk");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("cache-dir");
                File out = new File(dir, "Periapsis.apk");
                if (out.exists()) out.delete();

                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true); // GitHub answers with a redirect to its CDN (https -> https)
                int code = conn.getResponseCode();
                if (code != 200) throw new Exception("http-" + code);
                long total = conn.getContentLengthLong();

                long received = 0;
                int lastPct = -1;
                try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        fos.write(buf, 0, n);
                        received += n;
                        if (total > 0) {
                            int pct = (int) (received * 100 / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                JSObject p = new JSObject();
                                p.put("percent", pct);
                                notifyListeners("progress", p);
                            }
                        }
                    }
                }
                if (total > 0 && received != total) throw new Exception("incomplete");
                if (out.length() < 1_000_000) throw new Exception("too-small"); // an error page, not an APK

                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", out);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);

                JSObject r = new JSObject();
                r.put("status", "started");
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "failed" : e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }
}
