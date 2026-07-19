const express = require('express');
const { getDB } = require('../db');
const { getCurrentWeather, evaluateSeverity, getAirQuality, getUVIndex, formatSunrise } = require('../services/weatherService');
const { createAlert } = require('../models/Alert');
const { verifyAdmin } = require('../middleware/auth');

const router = express.Router();

function parseCoord(value, name) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        const err = new Error(`Invalid ${name}: must be a number`);
        err.status = 400;
        throw err;
    }
    return num;
}

function getIO(req) {
    return req.app.get('io');
}

// PUBLIC: current weather (+ AQI, UV index, sunrise) + auto-evaluated hazard severity for a location
router.get('/current', async (req, res, next) => {
    try {
        const { lat, lng } = req.query;
        if (lat == null || lng == null) return res.status(400).json({ error: 'Query parameters "lat" and "lng" are required' });
        const latitude = parseCoord(lat, 'lat');
        const longitude = parseCoord(lng, 'lng');
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({ error: 'Coordinates out of valid range' });
        }

        const [weather, airQuality, uvIndex] = await Promise.all([
            getCurrentWeather(latitude, longitude),
            getAirQuality(latitude, longitude),
            getUVIndex(latitude, longitude),
        ]);

        const sunrise = formatSunrise(weather.sunriseUnix, weather.timezoneOffsetSec);
        const severityInfo = evaluateSeverity(weather);

        res.json({
            weather: { ...weather, sunrise, airQuality, uvIndex },
            severeConditionDetected: !!severityInfo,
            severity: severityInfo,
        });
    } catch (err) { next(err); }
});

// ADMIN: check live weather for a location, auto-create a geo-targeted alert if hazardous
router.post('/check-and-alert', verifyAdmin, async (req, res, next) => {
    try {
        const { lat, lng, radiusKm, affectedStates } = req.body;
        if (lat == null || lng == null) return res.status(400).json({ error: '"lat" and "lng" are required' });
        const latitude = parseCoord(lat, 'lat');
        const longitude = parseCoord(lng, 'lng');
        const radius = radiusKm != null ? Number(radiusKm) : 25;

        const weather = await getCurrentWeather(latitude, longitude);
        const severityInfo = evaluateSeverity(weather);

        if (!severityInfo) {
            return res.json({ alertCreated: false, weather });
        }

        const doc = createAlert({
            adminId: req.user.uid,
            title: severityInfo.title,
            message: `${severityInfo.message} (Auto-generated from live weather data.)`,
            severity: severityInfo.severity,
            affectedStates: Array.isArray(affectedStates) && affectedStates.length ? affectedStates : ['Unspecified'],
            lat: latitude,
            lng: longitude,
            radiusKm: radius,
        });
        const result = await getDB().collection('alerts').insertOne(doc);
        const savedAlert = { _id: result.insertedId, ...doc };

        const io = getIO(req);
        if (io) io.emit('new-alert', savedAlert);

        res.status(201).json({ alertCreated: true, alert: savedAlert, weather });
    } catch (err) { next(err); }
});

module.exports = router;