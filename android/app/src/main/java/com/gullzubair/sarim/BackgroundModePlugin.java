package com.gullzubair.sarim;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundMode")
public class BackgroundModePlugin extends Plugin {

    private boolean batteryExempt() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private JSObject status() {
        JSObject out = new JSObject();
        out.put("running", KeepAliveService.running);
        out.put("batteryExempt", batteryExempt());
        return out;
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Context ctx = getContext();
            ContextCompat.startForegroundService(ctx, new Intent(ctx, KeepAliveService.class));
            call.resolve(status());
        } catch (Exception e) {
            call.reject("Could not start background mode: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Context ctx = getContext();
            ctx.stopService(new Intent(ctx, KeepAliveService.class));
            KeepAliveService.running = false;
            call.resolve(status());
        } catch (Exception e) {
            call.reject("Could not stop background mode: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        if (batteryExempt()) {
            call.resolve(status());
            return;
        }
        try {
            Intent ask = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            ask.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(ask);
        } catch (Exception first) {
            try {
                Intent list = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                list.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(list);
            } catch (Exception second) {
                call.reject("Could not open battery settings");
                return;
            }
        }
        call.resolve(status());
    }
}
