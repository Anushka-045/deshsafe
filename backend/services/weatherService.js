const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

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
    };
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

module.exports = { getCurrentWeather, evaluateSeverity };