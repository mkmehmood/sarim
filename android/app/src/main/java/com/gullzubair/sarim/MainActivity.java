package com.gullzubair.sarim;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        registerPlugin(HapticFeedbackPlugin.class);
        registerPlugin(DirectSharePlugin.class);
        registerPlugin(WindowBackgroundPlugin.class);
        super.onCreate(savedInstanceState);
        if (WindowBackgroundPlugin.hasSaved(this)) {
            WindowBackgroundPlugin.paint(this, getBridge() != null ? getBridge().getWebView() : null, WindowBackgroundPlugin.saved(this));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        }
    }
}
