const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';
const AIR_POLLUTION_URL = 'https://api.openweathermap.org/data/2.5/air_pollution';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

const AQI_LABELS = { 1: 'Good', 2: 'Fair', 3: 'Moderate', 4: 'Poor', 5: 'Very Poor' };

async function getCurrentWeather(lat, lng) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
        const err = new Error('OPENWEATHER_API_KEY is not configured');
        err.status = 500;
        throw err;
    }
    const url = `${BASE_URL}?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
        const err = new Error(data.message || 'Failed to fetch weather data');
        err.status = response.status === 401 ? 502 : response.status;
        throw err;
    }
    return {
        location: data.name || null,
        condition: data.weather?.[0]?.main || null,
        description: data.weather?.[0]?.description || null,
        tempC: data.main?.temp ?? null,
        feelsLikeC: data.main?.feels_like ?? null,
        humidity: data.main?.humidity ?? null,
        windSpeedMs: data.wind?.speed ?? null,
        visibilityM: data.visibility ?? null,
        rain1hMm: data.rain?.['1h'] ?? 0,
        sunriseUnix: data.sys?.sunrise ?? null,
        timezoneOffsetSec: data.timezone ?? 0,
    };
}

// Free tier: OpenWeatherMap Air Pollution API, same key as current weather.
// Returns their 1-5 scale (not the 0-500 US EPA scale) — display as label + index.
async function getAirQuality(lat, lng) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) return null;
    try {
        const url = `${AIR_POLLUTION_URL}?lat=${lat}&lon=${lng}&appid=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const aqiIndex = data.list?.[0]?.main?.aqi ?? null;
        if (aqiIndex == null) return null;
        return {
            aqiIndex,
            aqiLabel: AQI_LABELS[aqiIndex] || 'Unknown',
            components: data.list?.[0]?.components ?? null,
        };
    } catch (e) {
        console.warn('[weatherService] Air quality fetch failed:', e.message);
        return null;
    }
}

// Free tier: Open-Meteo, no API key required.
async function getUVIndex(lat, lng) {
    try {
        const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lng}&current=uv_index`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const uv = data.current?.uv_index;
        return typeof uv === 'number' ? uv : null;
    } catch (e) {
        console.warn('[weatherService] UV index fetch failed:', e.message);
        return null;
    }
}

// Formats a UTC sunrise timestamp into a local "H:MMam/pm" string using the
// location's own UTC offset (not the server's), so it reads correctly regardless
// of where the backend is hosted.
function formatSunrise(sunriseUnix, timezoneOffsetSec) {
    if (sunriseUnix == null) return null;
    const localMs = (sunriseUnix + (timezoneOffsetSec || 0)) * 1000;
    const d = new Date(localMs);
    let hours = d.getUTCHours();
    const minutes = d.getUTCMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${minutesStr}${ampm}`;
}

/**
 * Evaluates raw weather data against hazard thresholds.
 * Returns null if conditions are normal, or { type, severity, title, message } if hazardous.
 * Checked highest-severity-first so only the most urgent match is returned.
 */
function evaluateSeverity(weather) {
    const { condition, tempC, windSpeedMs, rain1hMm, visibilityM } = weather;

    if (windSpeedMs != null && windSpeedMs >= 17.2) {
        return {
            type: 'cyclone',
            severity: 'critical',
            title: 'Severe Storm / Cyclone Warning',
            message: `Very high winds detected (${windSpeedMs} m/s). Seek shelter immediately.`
        };
    }
    if (tempC != null && tempC >= 45) {
        return {
            type: 'heatwave',
            severity: 'critical',
            title: 'Extreme Heatwave Warning',
            message: `Extreme temperature recorded (${tempC}°C). Avoid outdoor exposure.`
        };
    }
    if (rain1hMm != null && rain1hMm >= 15) {
        return {
            type: 'flood',
            severity: 'danger',
            title: 'Heavy Rain / Flood Risk',
            message: `Heavy rainfall detected (${rain1hMm} mm in the last hour). Flooding risk in low-lying areas.`
        };
    }
    if (windSpeedMs != null && windSpeedMs >= 10.8) {
        return {
            type: 'high_wind',
            severity: 'danger',
            title: 'High Wind Advisory',
            message: `Strong winds detected (${windSpeedMs} m/s).`
        };
    }
    if (tempC != null && tempC >= 40) {
        return {
            type: 'heatwave',
            severity: 'danger',
            title: 'Heatwave Advisory',
            message: `High temperature recorded (${tempC}°C). Stay hydrated and avoid peak sun hours.`
        };
    }
    if (rain1hMm != null && rain1hMm >= 7.5) {
        return {
            type: 'rain',
            severity: 'warning',
            title: 'Moderate Rain Advisory',
            message: `Moderate rainfall detected (${rain1hMm} mm in the last hour).`
        };
    }
    if (condition === 'Thunderstorm') {
        return {
            type: 'thunderstorm',
            severity: 'warning',
            title: 'Thunderstorm Advisory',
            message: 'Thunderstorm activity detected in the area.'
        };
    }
    if (visibilityM != null && visibilityM < 1000 && ['Fog', 'Mist', 'Haze'].includes(condition)) {
        return {
            type: 'fog',
            severity: 'warning',
            title: 'Low Visibility Advisory',
            message: `Reduced visibility (${visibilityM}m) due to ${condition.toLowerCase()}.`
        };
    }
    return null;
}

module.exports = { getCurrentWeather, evaluateSeverity, getAirQuality, getUVIndex, formatSunrise };