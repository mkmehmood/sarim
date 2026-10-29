package com.gullzubair.sarim;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ThemeBars")
public class ThemeBarsPlugin extends Plugin {

    @PluginMethod
    public void apply(final PluginCall call) {
        final String hex = call.getString("color", "#000000");
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    int color = Color.parseColor(hex);
                    Window window = getActivity().getWindow();
                    View decor = window.getDecorView();
                    window.setBackgroundDrawable(new ColorDrawable(color));
                    decor.setBackgroundColor(color);
                    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
                    controller.setAppearanceLightStatusBars(light);
                    controller.setAppearanceLightNavigationBars(light);
                    applyLegacyBarColors(window, color);
                    call.resolve();
                } catch (Exception e) {
                    call.reject("Theme bars not applied: " + e.getMessage());
                }
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void applyLegacyBarColors(Window window, int color) {
        if (Build.VERSION.SDK_INT >= 35) {
            return;
        }
        window.setStatusBarColor(color);
        window.setNavigationBarColor(color);
    }
}
