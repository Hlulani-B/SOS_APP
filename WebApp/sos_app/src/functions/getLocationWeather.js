/**
 * getLocationAndWeather - one call, both answers.
 *
 * Takes coordinates and returns the nearest place plus the current weather
 * there. Town and province come from BigDataCloud's free reverse-geocode,
 * the street from Nominatim (OpenStreetMap) - BigDataCloud's keyless client
 * endpoint verifiably never returns street fields, and Open-Meteo's geocoder
 * only goes name -> coords, never the reverse.
 *
 * No lookup is allowed to sink the others: a failed geocode degrades to
 * whichever parts did arrive, and weather is only dropped if its own
 * request actually rejects.
 */

// Open-Meteo weather_code -> condition text + emoji icon (mirrors WeatherPage).
function describeWeatherCode(code) {
  if (code === 0) return { condition: "Clear", icon: "☀️" };
  if (code === 1) return { condition: "Mostly Clear", icon: "🌤️" };
  if (code === 2) return { condition: "Partly Cloudy", icon: "⛅" };
  if (code === 3) return { condition: "Overcast", icon: "☁️" };
  if (code === 45 || code === 48) return { condition: "Foggy", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { condition: "Drizzle", icon: "🌦️" };
  if (code >= 61 && code <= 67) return { condition: "Rainy", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { condition: "Snowy", icon: "❄️" };
  if (code >= 80 && code <= 82) return { condition: "Showers", icon: "🌧️" };
  if (code >= 85 && code <= 86) return { condition: "Snow Showers", icon: "🌨️" };
  if (code >= 95) return { condition: "Thunderstorm", icon: "⛈️" };
  return { condition: "Fair", icon: "🌤️" };
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${lat}&longitude=${lon}&localityLanguage=en`
  );
  if (!res.ok) throw new Error(`reverse-geocode failed (${res.status})`);
  const d = await res.json();
  // Prefer the tightest locality we have, walking up to broader areas.
  const name = d.city || d.locality || d.principalSubdivision || d.countryName || null;
  const town = d.city || d.locality || null;
  const province = d.principalSubdivision || null;
  return { name, town, province };
}

// Street number + road name, which BigDataCloud's free tier does not carry.
// Nominatim's usage policy wants an Ident and caps at 1 req/s, so every
// lookup rides a shared promise chain with a short cooldown between calls -
// the pals cards prefetch several at once and must not burst past it.
let streetQueue = Promise.resolve();
function reverseGeocodeStreet(lat, lon) {
  const run = streetQueue.then(async () => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}` +
      `&zoom=18&addressdetails=1&format=jsonv2`,
      { headers: { Ident: "sos-weather-pals-map/1.0" } }
    );
    if (!res.ok) throw new Error(`street geocode failed (${res.status})`);
    const a = (await res.json()).address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    await new Promise((done) => setTimeout(done, 1100));
    return street || null;
  });
  // A failed lookup must not poison the queue for the callers behind it.
  streetQueue = run.then(() => {}, () => {});
  return run;
}

async function fetchWeather(lat, lon) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
  );
  if (!res.ok) throw new Error(`weather fetch failed (${res.status})`);
  const current = (await res.json()).current;
  const { condition, icon } = describeWeatherCode(current.weather_code);
  return {
    temp: Math.round(current.temperature_2m),
    humidity: Math.round(current.relative_humidity_2m),
    wind: Math.round(current.wind_speed_10m),
    condition,
    icon
  };
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ name: string, place: { street, town, province }, location: { latitude: number, longitude: number }, weather: object }>}
 */
export async function getLocationAndWeather(lat, lon) {
  // All three race from the caller's point of view; the street lookup
  // internally queues itself against Nominatim's rate limit, so its card
  // may fill in a beat after the weather line does.
  const [geocodeResult, weatherResult, streetResult] = await Promise.all([
    reverseGeocode(lat, lon).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason })
    ),
    fetchWeather(lat, lon).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason })
    ),
    reverseGeocodeStreet(lat, lon).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason })
    )
  ]);

  if (weatherResult.status === "rejected") {
    throw weatherResult.reason;
  }

  const place =
    geocodeResult.status === "fulfilled"
      ? geocodeResult.value
      : { name: null, town: null, province: null };
  const street = streetResult.status === "fulfilled" ? streetResult.value : null;

  return {
    name: place.name || `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`,
    place: { street, town: place.town, province: place.province },
    location: { latitude: lat, longitude: lon },
    weather: weatherResult.value
  };
}
