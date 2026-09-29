package com.mysos.weather;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;

import androidx.core.content.ContextCompat;

/**
 * A deliberately EMPTY accessibility service. It reads no events and does
 * nothing with them - it exists for exactly two side effects:
 *
 * 1. A package with an enabled AccessibilityService is exempt from Android's
 *    background-activity-launch block, which is what lets WakeService
 *    startActivity() "help" from a locked pocket.
 * 2. A cheap watchdog: Android loves killing long-running services, so once
 *    a minute we restart WakeService if the user's switch says it should be
 *    alive. (Restarting a MIC foreground service from the background can
 *    still be refused on Android 14+; the try/catch swallows that and the
 *    next app open fixes it.)
 *
 * The user flips this on once in the guided settings (there is no legal way
 * for an app to self-enable it) - see VoiceWakePlugin.openAccessibilitySettings.
 */
public class VoiceAssistService extends android.accessibilityservice.AccessibilityService {

    private static long sLastCheck = 0;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        ensureWakeService();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Intentionally not inspecting the event at all - covertness and
        // privacy both demand zero data handling. Throttled watchdog only.
        long now = SystemClock.elapsedRealtime();
        if (now - sLastCheck > 60_000) {
            sLastCheck = now;
            ensureWakeService();
        }
    }

    @Override
    public void onInterrupt() {
    }

    private void ensureWakeService() {
        boolean enabled = getSharedPreferences(WakeService.PREFS, Context.MODE_PRIVATE)
                .getBoolean(WakeService.KEY_ENABLED, false);
        if (!enabled || WakeService.isRunning()) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) return;
        try {
            Intent i = new Intent(this, WakeService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(i);
            } else {
                startService(i);
            }
        } catch (Exception ignored) {
            // OEM refused a background FGS start - harmless, retried later.
        }
    }
}
