package com.mysos.weather;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Always-listening wake service: the single word "help" launches the app and
 * queues the video-record action for the web layer to pick up.
 *
 * Why it works despite Android's background-mic ban: a microphone-type
 * foreground service STARTED WHILE THE APP IS IN FOREGROUND keeps mic access
 * after the app leaves (Android 11+ rule). The engine is Vosk - fully
 * offline, no keys, nothing leaves the phone.
 *
 * The recognition grammar is narrowed to one word so it is fast, battery
 * cheap, and nearly false-positive proof; random conversation about "helping"
 * still triggers it, which is the accepted trade-off the product chose.
 *
 * Disguise rules for the notification: weather wording only, LOW importance,
 * no sound, no badge.
 */
public class WakeService extends Service {

    public static final String PREFS = "voice_wake";
    public static final String KEY_ENABLED = "enabled";
    public static final String KEY_PENDING_ACTION = "pending_action";

    static final String ACTION_STOP = "com.mysos.weather.action.STOP_WAKE";

    private static final String TAG = "WakeService";
    private static final String CHANNEL_ID = "weather";
    // Separate HIGH-importance channel used only as a fallback: when the
    // accessibility exemption isn't on, a background startActivity is silently
    // refused, so we surface a tappable heads-up notification instead.
    private static final String ALERT_CHANNEL_ID = "weather_alert";
    private static final int NOTIFICATION_ID = 7301;
    // One spoken word streams through many 100ms chunks and the trailing audio
    // keeps matching "help"; without this window a single utterance fires a
    // dozen wakes (endless vibration + launch spam). 4s is a spoken-word-safe
    // gap that still allows a deliberate second try.
    private static final long WAKE_COOLDOWN_MS = 4000;
    private static final int SAMPLE_RATE = 16000;
    // 100ms slices - responsive enough for a wake word, cheap on CPU.
    private static final int CHUNK_SAMPLES = SAMPLE_RATE / 10;

    // Same-process flags. MainActivity flips sPaused from onResume/onPause so
    // the mic is released while the app is up (video recording needs it and
    // listening is pointless with the app already open).
    private static volatile boolean sRunning = false;
    private static volatile boolean sPaused = false;

    private volatile boolean mLoopAlive = false;
    private volatile long mLastWakeAt = 0;
    private Thread mListenerThread;
    private PowerManager.WakeLock mWakeLock;

    public static boolean isRunning() {
        return sRunning;
    }

    public static void setAppPaused(Context ctx, boolean paused) {
        sPaused = paused;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        sRunning = true;
        createChannel();
        createAlertChannel();
        // startForeground with no explicit type inherits microphone from the
        // manifest, which is the exemption that keeps the mic alive here.
        startForeground(NOTIFICATION_ID, buildNotification());
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "weather:listen");
        mWakeLock.setReferenceCounted(false);
        mWakeLock.acquire();
        startListenLoop();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // If the switch was turned off while the system auto-restarted us
        // (START_STICKY), honour it and go back to sleep.
        boolean enabled = getSharedPreferences(PREFS, MODE_PRIVATE)
                .getBoolean(KEY_ENABLED, false);
        if (!enabled) {
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        sRunning = false;
        mLoopAlive = false;
        if (mListenerThread != null) mListenerThread.interrupt();
        if (mWakeLock != null && mWakeLock.isHeld()) mWakeLock.release();
    }

    @Override
    public android.os.IBinder onBind(Intent intent) {
        return null;
    }

    // ------------------------------------------------------------------ loop

    private void startListenLoop() {
        mLoopAlive = true;
        mListenerThread = new Thread(this::listenLoop, "wake-listen");
        mListenerThread.start();
    }

    private void listenLoop() {
        Model model = null;
        Recognizer recognizer = null;
        AudioRecord record = null;
        try {
            File modelDir = ensureModel();
            if (modelDir == null) {
                Log.e(TAG, "vosk model unavailable, stopping");
                stopSelf();
                return;
            }
            model = new Model(modelDir.getAbsolutePath());
            short[] buffer = new short[CHUNK_SAMPLES];

            while (mLoopAlive) {
                if (sPaused) {
                    // Hand the mic back: release everything, idle, re-open on resume.
                    if (record != null) {
                        try { record.stop(); } catch (Exception ignored) {}
                        record.release();
                        record = null;
                    }
                    if (recognizer != null) {
                        recognizer.close();
                        recognizer = null;
                    }
                    sleep(300);
                    continue;
                }
                if (recognizer == null) {
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                            != PackageManager.PERMISSION_GRANTED) {
                        // Permission revoked mid-flight: stop instead of spinning on errors.
                        mLoopAlive = false;
                        stopSelf();
                        return;
                    }
                    recognizer = new Recognizer(model, SAMPLE_RATE, "[\"help\", \"[unk]\"]");
                    int min = AudioRecord.getMinBufferSize(SAMPLE_RATE,
                            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                    record = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,
                            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
                            AudioFormat.ENCODING_PCM_16BIT,
                            Math.max(min, CHUNK_SAMPLES * 4));
                    if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                        record.release();
                        record = null;
                        sleep(2000); // busy mic (a call?) - back off and retry
                        continue;
                    }
                    record.startRecording();
                }

                int read = record.read(buffer, 0, buffer.length);
                if (read <= 0) continue;

                boolean utteranceFinished = recognizer.acceptWaveForm(buffer, read);
                // Check partials too: reacts ~0.7s faster than waiting for
                // the end-of-speech result, which matters in an emergency.
                String heard = utteranceFinished
                        ? jsonField(recognizer.getResult(), "text")
                        : jsonField(recognizer.getPartialResult(), "partial");
                if (heard.contains("help")) {
                    onWakeWord(recognizer);
                }
            }
        } catch (Throwable t) {
            Log.e(TAG, "wake loop died", t);
            stopSelf();
        } finally {
            if (record != null) {
                try { record.stop(); } catch (Exception ignored) {}
                record.release();
            }
            if (recognizer != null) recognizer.close();
            if (model != null) model.close();
        }
    }

    private void onWakeWord(Recognizer recognizer) {
        long now = System.currentTimeMillis();
        if (now - mLastWakeAt < WAKE_COOLDOWN_MS) {
            // Inside the debounce window: drop the buffered audio so the tail
            // of the same word stops matching, but do NOT re-fire.
            recognizer.reset();
            return;
        }
        mLastWakeAt = now;
        Log.i(TAG, "wake word heard");
        vibrate();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(KEY_PENDING_ACTION, "video")
                .apply();
        // Background activity launch is normally blocked; an ENABLED
        // accessibility service (VoiceAssistService) exempts this package,
        // which is the whole reason that no-op service exists.
        Intent launch = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        boolean launched = false;
        try {
            startActivity(launch);
            launched = true;
        } catch (Exception e) {
            Log.e(TAG, "launch blocked on this OEM", e);
        }
        // No accessibility exemption (or an OEM that still refuses BAL): the
        // direct launch was refused, so fall back to a heads-up notification
        // the user can tap. The wake is never a silent dead end.
        if (!launched) {
            showWakeNotification();
        }
        recognizer.reset();
    }

    /** Heads-up "Weather" notification that opens the app on tap. */
    private void showWakeNotification() {
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, piFlags);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, ALERT_CHANNEL_ID)
                : new Notification.Builder(this);
        Notification n = b.setContentTitle("Weather")
                .setContentText("Tap to check the forecast")
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID + 1, n);
    }

    private void createAlertChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(ALERT_CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        ALERT_CHANNEL_ID, "Weather alerts",
                        NotificationManager.IMPORTANCE_HIGH);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }
    }

    // ----------------------------------------------------------------- utils

    /** The ~40MB model ships in APK assets but Vosk needs a real directory,
     *  so copy it to filesDir once and remember with a marker file. */
    private File ensureModel() {
        File dest = new File(getFilesDir(), "vosk-model-en");
        File marker = new File(dest, ".copied");
        if (!marker.exists()) {
            try {
                copyAsset("vosk-model-en", dest);
                try (OutputStream os = new FileOutputStream(marker)) {
                    os.write(1);
                }
            } catch (IOException e) {
                Log.e(TAG, "model copy failed", e);
                return null;
            }
        }
        return dest;
    }

    private void copyAsset(String path, File out) throws IOException {
        String[] kids = getAssets().list(path);
        if (kids == null || kids.length == 0) {
            File parent = out.getParentFile();
            if (parent != null) parent.mkdirs();
            try (InputStream in = getAssets().open(path);
                 FileOutputStream o = new FileOutputStream(out)) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            }
        } else {
            out.mkdirs();
            for (String kid : kids) {
                copyAsset(path + "/" + kid, new File(out, kid));
            }
        }
    }

    private String jsonField(String json, String field) {
        try {
            return new JSONObject(json).optString(field, "");
        } catch (Exception e) {
            return "";
        }
    }

    private void vibrate() {
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(400, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            v.vibrate(400);
        }
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            mLoopAlive = false;
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "Weather", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                ch.setDescription("Checking the forecast");
                nm.createNotificationChannel(ch);
            }
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return b.setContentTitle("Weather")
                .setContentText("Checking the forecast")
                .setSmallIcon(android.R.drawable.ic_popup_sync)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }
}
