import { Capacitor } from '@capacitor/core';

/**
 * Single geolocation source for everything that needs coordinates: the
 * alert emails (getMapsLink) and the live-location share (ShareLocation).
 *
 * On a packaged app, navigator.geolocation is unreliable inside the WebView
 * and never triggers the Android runtime permission prompt, so we go through
 * @capacitor/geolocation there (the plugin requests ACCESS_LOCATION itself).
 * In the browser we keep the plain web API so dev is completely unchanged -
 * and the plugin is imported lazily so its native code never enters the web
 * bundle.
 *
 * Resolves { latitude, longitude }; rejects on no-support / denial / timeout,
 * letting each caller decide how to degrade.
 */
export async function getPosition() {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('No geolocation available on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
