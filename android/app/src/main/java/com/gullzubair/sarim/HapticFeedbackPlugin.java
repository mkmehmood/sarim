package com.gullzubair.sarim;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HapticFeedback")
public class HapticFeedbackPlugin extends Plugin {

    private Vibrator vibrator() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager == null ? null : manager.getDefaultVibrator();
        }
        return legacyVibrator(ctx);
    }

    @SuppressWarnings("deprecation")
    private Vibrator legacyVibrator(Context ctx) {
        return (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
    }

    private JSObject describe() {
        JSObject out = new JSObject();
        Vibrator vib = vibrator();
        out.put("hasVibrator", vib != null && vib.hasVibrator());
        boolean touch = true;
        try {
            touch = Settings.System.getInt(getContext().getContentResolver(), Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) != 0;
        } catch (Exception ignored) {
        }
        out.put("touchFeedback", touch);
        String ringer = "normal";
        try {
            AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audio != null) {
                int mode = audio.getRingerMode();
                if (mode == AudioManager.RINGER_MODE_SILENT) {
                    ringer = "silent";
                } else if (mode == AudioManager.RINGER_MODE_VIBRATE) {
                    ringer = "vibrate";
                }
            }
        } catch (Exception ignored) {
        }
        out.put("ringerMode", ringer);
        out.put("sdk", Build.VERSION.SDK_INT);
        return out;
    }

    private int constantFor(String kind) {
        if ("tick".equals(kind)) {
            return HapticFeedbackConstants.CLOCK_TICK;
        }
        if ("long".equals(kind)) {
            return HapticFeedbackConstants.LONG_PRESS;
        }
        if ("confirm".equals(kind)) {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.CONTEXT_CLICK;
        }
        if ("reject".equals(kind)) {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
        }
        return HapticFeedbackConstants.KEYBOARD_TAP;
    }

    @SuppressWarnings("deprecation")
    private boolean touchVibration(int duration) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return false;
        }
        try {
            Vibrator vib = vibrator();
            if (vib == null || !vib.hasVibrator()) {
                return false;
            }
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            vib.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE), attrs);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(describe());
    }

    @PluginMethod
    public void perform(final PluginCall call) {
        final String kind = call.getString("kind", "tap");
        Integer requested = call.getInt("duration", 40);
        final int duration = Math.max(20, Math.min(requested == null ? 40 : requested, 400));
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                JSObject out = describe();
                boolean view = false;
                try {
                    View webView = getBridge().getWebView();
                    if (webView != null) {
                        view = webView.performHapticFeedback(constantFor(kind));
                    }
                } catch (Exception ignored) {
                }
                out.put("viewHaptic", view);
                out.put("touchVibration", touchVibration(duration));
                call.resolve(out);
            }
        });
    }
}
