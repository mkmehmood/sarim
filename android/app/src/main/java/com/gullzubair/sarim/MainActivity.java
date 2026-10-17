package com.gullzubair.sarim;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveFilePlugin.class);
        registerPlugin(HapticFeedbackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
