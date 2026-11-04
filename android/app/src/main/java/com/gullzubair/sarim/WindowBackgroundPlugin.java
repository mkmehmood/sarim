package com.gullzubair.sarim;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WindowBackground")
public class WindowBackgroundPlugin extends Plugin {

    static final String PREFS = "window_background";
    static final String KEY = "color";

    static void paint(Activity activity, WebView webView, int color) {
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(color));
        activity.getWindow().getDecorView().setBackgroundColor(color);
        if (webView != null) webView.setBackgroundColor(color);
    }

    static boolean hasSaved(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).contains(KEY);
    }

    static int saved(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY, Color.BLACK);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("color");
        final int color;
        try {
            color = Color.parseColor(value);
        } catch (Exception e) {
            call.reject("Invalid color");
            return;
        }
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        SharedPreferences.Editor ed = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putInt(KEY, color).apply();
        activity.runOnUiThread(() -> {
            paint(activity, getBridge().getWebView(), color);
            JSObject out = new JSObject();
            out.put("color", value);
            call.resolve(out);
        });
    }
}
