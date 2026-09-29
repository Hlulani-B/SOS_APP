package com.mysos.weather;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import android.Manifest;

/**
 * The JS-facing switch for the built-in "help" wake word. Everything the web
 * layer needs: read state, turn the engine on/off, jump to the two system
 * screens the user must visit once, and collect the pending wake action so
 * the Weather page can start the Johannesburg video recorder.
 */
@CapacitorPlugin(
        name = "VoiceWake",
        permissions = {
                @Permission(alias = VoiceWakePlugin.MIC_ALIAS,
                        strings = { Manifest.permission.RECORD_AUDIO })
        }
)
public class VoiceWakePlugin extends Plugin {

    static final String MIC_ALIAS = "microphone";

    private SharedPreferences prefs() {
        return getContext().getApplicationContext()
                .getSharedPreferences(WakeService.PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject s = new JSObject();
        s.put("enabled", prefs().getBoolean(WakeService.KEY_ENABLED, false));
        s.put("running", WakeService.isRunning());
        s.put("microphone",
                getPermissionState(MIC_ALIAS) == PermissionState.GRANTED);
        s.put("accessibility", accessibilityEnabled());
        call.resolve(s);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        if (getPermissionState(MIC_ALIAS) != PermissionState.GRANTED) {
            // Flowing the permission request through Capacitor keeps the
            // dialog wording identical to the rest of the app.
            requestPermissionForAlias(MIC_ALIAS, call, "micPermissionResult");
            return;
        }
        startEngine(call);
    }

    @PermissionCallback
    private void micPermissionResult(PluginCall call) {
        if (getPermissionState(MIC_ALIAS) != PermissionState.GRANTED) {
            call.reject("Microphone permission is required for the wake word");
            return;
        }
        startEngine(call);
    }

    private void startEngine(PluginCall call) {
        prefs().edit().putBoolean(WakeService.KEY_ENABLED, true).apply();
        try {
            Intent i = new Intent(getContext(), WakeService.class);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                getContext().startForegroundService(i);
            } else {
                getContext().startService(i);
            }
        } catch (Exception e) {
            call.reject("Could not start the wake service: " + e.getMessage());
            return;
        }
        status(call);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        prefs().edit()
                .putBoolean(WakeService.KEY_ENABLED, false)
                .remove(WakeService.KEY_PENDING_ACTION)
                .apply();
        try {
            getContext().stopService(new Intent(getContext(), WakeService.class));
        } catch (Exception ignored) {
            // Stopping an already-dead service is not an error for the user.
        }
        status(call);
    }

    /** One-shot read of the wake action: returns "video" once per wake, then
     *  "none". The Weather page polls this on load and while visible. */
    @PluginMethod
    public void consumePending(PluginCall call) {
        String action = prefs().getString(WakeService.KEY_PENDING_ACTION, "");
        prefs().edit().remove(WakeService.KEY_PENDING_ACTION).apply();
        JSObject ret = new JSObject();
        ret.put("action", action == null || action.isEmpty() ? "none" : action);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("This phone has no accessibility settings screen");
        }
    }

    /** Battery optimization whitelisting - OEM killers otherwise murder the
     *  listener on locked screens within minutes. */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
            return;
        } catch (Exception ignored) {
            // Some OEMs strip this screen; fall through to the app page.
        }
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + pkg))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("This phone has no battery settings screen");
        }
    }

    private boolean accessibilityEnabled() {
        String enabled = Settings.Secure.getString(
                getContext().getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        String mine = (getContext().getPackageName() + "/"
                + VoiceAssistService.class.getName()).toLowerCase();
        return enabled.toLowerCase().contains(mine);
    }
}
