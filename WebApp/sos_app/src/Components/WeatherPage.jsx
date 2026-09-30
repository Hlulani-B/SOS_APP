import React, { useState, useEffect, useRef } from "react";
import SideMenu from "./SideMenu";
import { VideoRecorder } from "./videoButton";
import { AudioRecorder } from "./audioButton";
import { SOSButton } from "./SOSButton";

// City list kept, but now only holds coordinates + which safety action (if any)
// each chip triggers. All weather numbers come from Open-Meteo at runtime.
const CITIES = {
  "Johannesburg": { lat: -26.2041, lon: 28.0473, action: "video" },
  "Cape Town": { lat: -33.9249, lon: 18.4241, action: "sos" },
  "Durban": { lat: -29.8587, lon: 31.0218, action: "audio" },
  "Giyani": { lat: -23.3100, lon: 30.7064, action: null },
  "London": { lat: 51.5072, lon: -0.1276, action: null },
  "New York": { lat: 40.7128, lon: -74.0060, action: null },
};

const ACTION_COLORS = {
  video: "#556b2f",
  sos: "#ff2d75",
  audio: "#eab308"
};

// Open-Meteo weather_code -> condition text + emoji icon
// https://open-meteo.com/en/docs#weathervariables
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

// Looks up a city by name via Open-Meteo's geocoding API, used for cities
// typed into search that aren't in the CITIES table above.
async function geocodeCity(name) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`
  );
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`No location found for "${name}"`);
  }
  return { lat: data.results[0].latitude, lon: data.results[0].longitude };
}

async function fetchCurrentWeather(lat, lon) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
  );
  const data = await res.json();
  const current = data.current;
  const { condition, icon } = describeWeatherCode(current.weather_code);

  return {
    temp: Math.round(current.temperature_2m),
    humidity: Math.round(current.relative_humidity_2m),
    wind: Math.round(current.wind_speed_10m),
    condition,
    icon
  };
}

// Hourly + daily come from a second request fired in parallel with the one
// above, so fetchCurrentWeather keeps working exactly as it did. Two calls
// still resolve in about the time of one, and it means the existing
// current-conditions path is untouched if this ever has to be reverted.
async function fetchForecast(lat, lon) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
    `&forecast_days=7&timezone=auto`
  );
  const data = await res.json();
  const { hourly, daily } = data;
  if (!hourly || !daily) {
    throw new Error("Forecast service returned an unexpected response");
  }

  // Hourly times arrive in the *city's* clock, so comparing them against a
  // browser Date would shift the window for any city not on her timezone.
  // Offsetting UTC by the city's own offset keeps the comparison honest.
  const cityNow = new Date(Date.now() + (data.utc_offset_seconds || 0) * 1000)
    .toISOString()
    .slice(0, 16);
  const found = hourly.time.findIndex((t) => t >= cityNow);
  const start = found === -1 ? 0 : found;

  const hours = hourly.time.slice(start, start + 12).map((time, i) => ({
    time,
    temp: Math.round(hourly.temperature_2m[start + i]),
    code: hourly.weather_code[start + i],
    rain: hourly.precipitation_probability?.[start + i] ?? null
  }));

  const days = daily.time.map((date, i) => ({
    date,
    max: Math.round(daily.temperature_2m_max[i]),
    min: Math.round(daily.temperature_2m_min[i]),
    code: daily.weather_code[i],
    rain: daily.precipitation_probability_max?.[i] ?? null
  }));

  return { hours, days };
}

// "2026-09-27" -> "Sun". Parsed as local midnight on purpose: feeding a bare
// date to Date() reads it as UTC and rolls the weekday back a day west of
// Greenwich.
function dayName(date) {
  return new Date(`${date}T00:00`).toLocaleDateString(undefined, {
    weekday: "short"
  });
}

// Where the app booted before matters: a weather app that forgets your city
// on every reload is the tell that this isn't one.
const LAST_CITY_KEY = "sa_city";

export default function WeatherPage() {
  const [selectedCity, setSelectedCity] = useState(
    () => localStorage.getItem(LAST_CITY_KEY) || "London"
  );
  const [searchInput, setSearchInput] = useState("");
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    localStorage.setItem(LAST_CITY_KEY, selectedCity);
  }, [selectedCity]);

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      setLoading(true);
      setError(null);
      try {
        const known = CITIES[selectedCity];
        const coords = known
          ? { lat: known.lat, lon: known.lon }
          : await geocodeCity(selectedCity);

        const [current, nextForecast] = await Promise.all([
          fetchCurrentWeather(coords.lat, coords.lon),
          fetchForecast(coords.lat, coords.lon)
        ]);

        if (!cancelled) {
          setWeather(current);
          setForecast(nextForecast);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load weather");
          setForecast(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWeather();
    return () => { cancelled = true; };
  }, [selectedCity]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    // Title-case every word, not just the first: "cape town" has to come back
    // as "Cape Town" or it misses the CITIES table and leaves that chip
    // looking unselected even though it is the city being shown.
    const formatted = searchInput
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
    setSelectedCity(formatted);
    setSearchInput("");
  };

  // Shared chip look applied to both plain cities and the safety components
  const chip = (borderColor) => ({
    padding: "12px 22px",
    border: `1px solid ${borderColor}`,
    borderRadius: "24px",
    fontSize: "14px",
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.15s ease"
  });

  const renderCityChip = (cityName) => {
    const city = CITIES[cityName];
    const isSelected = selectedCity === cityName;

    // Plain city - a normal button
    if (!city.action) {
      return (
        <button
          key={cityName}
          style={
            isSelected
              ? { ...chip("#1a1a1a"), background: "#1a1a1a", color: "#fff" }
              : { ...chip("#e5e5e5"), background: "#fff", color: "#1a1a1a" }
          }
          onClick={() => setSelectedCity(cityName)}
        >
          {cityName}
        </button>
      );
    }

    // Safety city - the user's component disguised as a city chip
    const color = ACTION_COLORS[city.action];
    const dot = (
      <span
        key="dot"
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: isSelected ? "#fff" : color,
          flexShrink: 0
        }}
      />
    );

    const commonProps = {
      style: chip(color),
      onPress: () => setSelectedCity(cityName),
      idleColor: isSelected ? color : "#fff",
      idleTextColor: isSelected ? "#fff" : "#1a1a1a",
      activeColor: "#3b82f6",
      activeTextColor: "#fff"
    };

    if (city.action === "video") {
      return (
        <VideoRecorder key={cityName} {...commonProps}>
          {dot}{cityName}
        </VideoRecorder>
      );
    }
    if (city.action === "sos") {
      return (
        <SOSButton key={cityName} {...commonProps}>
          {dot}{cityName}
        </SOSButton>
      );
    }
    return (
      <AudioRecorder key={cityName} {...commonProps}>
        {dot}{cityName}
      </AudioRecorder>
    );
  };

  return (
    <div style={styles.container}>
      <style>{css}</style>
      <SideMenu title="Weather" theme="light" />

      {/* Header */}
      <header className="weather-header" style={styles.header}>
        <div className="weather-header-inner" style={styles.headerInner}>
          <h1 className="weather-logo" style={styles.logo}>Weather</h1>
          <form onSubmit={handleSearch} className="weather-search" style={styles.searchForm}>
            <input
              type="text"
              placeholder="Search city"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={styles.searchInput}
            />
          </form>
        </div>
      </header>

      {/* Current Conditions */}
      <section className="weather-current" style={styles.current}>
        <div style={styles.currentInner}>
          <div style={styles.cityName}>{selectedCity}</div>

          {loading && <div style={styles.condition}>Loading...</div>}

          {!loading && error && <div style={styles.condition}>{error}</div>}

          {!loading && !error && weather && (
            <>
              <div style={styles.tempRow}>
                <span className="icon" style={styles.icon}>{weather.icon}</span>
                <span className="temp" style={styles.temp}>{weather.temp}°</span>
              </div>
              <div style={styles.condition}>{weather.condition}</div>
              <div style={styles.details}>
                <div style={styles.detailItem}>
                  <div style={styles.detailLabel}>Humidity</div>
                  <div style={styles.detailValue}>{weather.humidity}%</div>
                </div>
                <div style={styles.detailDivider} />
                <div style={styles.detailItem}>
                  <div style={styles.detailLabel}>Wind</div>
                  <div style={styles.detailValue}>{weather.wind} km/h</div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Cities */}
      <section style={styles.citiesSection}>
        <h3 style={styles.sectionTitle}>Popular cities</h3>
        <div style={styles.chips}>
          {Object.keys(CITIES).map((city) => renderCityChip(city))}
        </div>
      </section>

      {/* Next hours */}
      {!loading && !error && forecast && (
        <section className="weather-block" style={styles.blockSection}>
          <h3 style={styles.sectionTitle}>Next hours</h3>
          <div style={styles.hourlyScroller}>
            {forecast.hours.map((hour) => (
              <div key={hour.time} style={styles.hourlyItem}>
                <div style={styles.hourlyTime}>{hour.time.slice(11, 16)}</div>
                <div style={styles.hourlyIcon}>
                  {describeWeatherCode(hour.code).icon}
                </div>
                <div style={styles.hourlyTemp}>{hour.temp}°</div>
                <div style={styles.rain}>
                  {hour.rain === null ? "\u00A0" : `${hour.rain}%`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Seven days */}
      {!loading && !error && forecast && (
        <section className="weather-block" style={{ ...styles.blockSection, paddingBottom: "80px" }}>
          <h3 style={styles.sectionTitle}>7-day forecast</h3>
          <div style={styles.dailyCard}>
            {forecast.days.map((day, i) => {
              const meta = describeWeatherCode(day.code);
              const isLast = i === forecast.days.length - 1;
              return (
                <div
                  key={day.date}
                  className="weather-daily-row"
                  style={{
                    ...styles.dailyRow,
                    borderBottom: isLast ? "none" : styles.dailyRow.borderBottom
                  }}
                >
                  <div style={styles.dailyName}>{dayName(day.date)}</div>
                  <div style={styles.dailyIcon}>{meta.icon}</div>
                  <div className="weather-daily-condition" style={styles.dailyCondition}>
                    {meta.condition}
                  </div>
                  <div style={styles.dailyRain}>
                    {day.rain === null ? "" : `${day.rain}%`}
                  </div>
                  <div style={styles.dailyTemps}>
                    <span style={styles.dailyMax}>{day.max}°</span>
                    <span style={styles.dailyMin}>{day.min}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "#fafafa",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#1a1a1a"
  },
  header: {
    background: "#fff",
    borderBottom: "1px solid #e5e5e5",
    padding: "20px 24px",
    position: "sticky",
    top: 0,
    zIndex: 10
  },
  headerInner: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "24px",
    paddingLeft: "72px"
  },
  logo: {
    fontSize: "28px",
    fontWeight: 300,
    letterSpacing: "0.05em",
    margin: 0,
    color: "#1a1a1a"
  },
  searchForm: {
    flex: "0 1 320px"
  },
  searchInput: {
    width: "100%",
    padding: "10px 18px",
    border: "1px solid #e5e5e5",
    borderRadius: "20px",
    background: "#f5f5f5",
    color: "#1a1a1a",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s, background 0.2s"
  },
  current: {
    background: "#fff",
    borderBottom: "1px solid #e5e5e5",
    padding: "72px 24px",
    textAlign: "center"
  },
  currentInner: {
    maxWidth: "480px",
    margin: "0 auto"
  },
  cityName: {
    fontSize: "18px",
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#666",
    marginBottom: "24px"
  },
  tempRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    marginBottom: "8px"
  },
  icon: {
    fontSize: "72px",
    lineHeight: 1
  },
  temp: {
    fontSize: "96px",
    fontWeight: 200,
    color: "#1a1a1a",
    lineHeight: 1
  },
  condition: {
    fontSize: "18px",
    color: "#666",
    marginBottom: "40px"
  },
  details: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "40px"
  },
  detailItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  detailDivider: {
    width: "1px",
    height: "36px",
    background: "#e5e5e5"
  },
  detailLabel: {
    fontSize: "12px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#999"
  },
  detailValue: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#1a1a1a"
  },
  blockSection: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "0 24px 40px"
  },
  hourlyScroller: {
    display: "flex",
    gap: "10px",
    overflowX: "auto",
    paddingBottom: "8px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "thin"
  },
  hourlyItem: {
    flex: "0 0 auto",
    width: "72px",
    padding: "16px 8px",
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: "16px",
    textAlign: "center"
  },
  hourlyTime: {
    fontSize: "12px",
    letterSpacing: "0.05em",
    color: "#999",
    marginBottom: "10px"
  },
  hourlyIcon: {
    fontSize: "24px",
    lineHeight: 1,
    marginBottom: "10px"
  },
  hourlyTemp: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#1a1a1a"
  },
  rain: {
    fontSize: "11px",
    color: "#5b9bd5",
    marginTop: "4px"
  },
  dailyCard: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: "16px",
    overflow: "hidden"
  },
  dailyRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "14px 18px",
    borderBottom: "1px solid #f0f0f0"
  },
  dailyName: {
    width: "52px",
    fontSize: "15px",
    fontWeight: 600,
    color: "#1a1a1a"
  },
  dailyIcon: {
    width: "28px",
    fontSize: "22px",
    lineHeight: 1,
    textAlign: "center"
  },
  dailyCondition: {
    flex: 1,
    fontSize: "14px",
    color: "#666"
  },
  dailyRain: {
    width: "48px",
    fontSize: "13px",
    color: "#5b9bd5",
    textAlign: "right"
  },
  dailyTemps: {
    display: "flex",
    gap: "12px",
    minWidth: "84px",
    justifyContent: "flex-end"
  },
  dailyMax: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#1a1a1a"
  },
  dailyMin: {
    fontSize: "15px",
    color: "#999"
  },
  citiesSection: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "0 24px 36px"
  },
  sectionTitle: {
    fontSize: "24px",
    fontWeight: 400,
    marginBottom: "24px",
    color: "#1a1a1a"
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px"
  }
};

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  button { font-family: inherit; -webkit-tap-highlight-color: transparent; }
  button:active { transform: scale(0.96); }
  input:focus { border-color: #bbb !important; background: #fff !important; }

  /* Mobile: stack the header below the hamburger, tighten the forecast */
  @media (max-width: 640px) {
    .weather-header { padding: 14px 16px !important; }
    .weather-header-inner {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 20px !important; /* search box starts below the 42px hamburger */
      padding-left: 0 !important;
    }
    .weather-logo { margin-left: 72px !important; } /* clears the fixed hamburger */
    .weather-search { flex: 1 1 auto !important; max-width: none !important; }
    .weather-current { padding: 44px 20px !important; }
    .temp { font-size: 72px !important; }
    .icon { font-size: 56px !important; }
    .weather-block { padding: 0 16px 32px !important; }
    .weather-daily-condition { display: none !important; }
  }
`;