package com.mysos.weather;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must happen BEFORE super.onCreate(): BridgeActivity builds the
        // WebView bridge inside super and reads initialPlugins at that point.
        initialPlugins.add(VoiceWakePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // App visible = release the wake mic: the WebView needs it for video
        // recording, and listening is pointless while the screen is open.
        WakeService.setAppPaused(this, true);
    }

    @Override
    public void onPause() {
        super.onPause();
        WakeService.setAppPaused(this, false);
    }
}
