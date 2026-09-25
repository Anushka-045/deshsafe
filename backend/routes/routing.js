const express = require('express');
const router = express.Router();

/**
 * GET /api/routing/evacuation
 * Query params: startLat, startLng, endLat, endLng, orsApiKey (optional)
 * Returns geometry (coordinates list), distance in km, duration in mins, and step-by-step directions.
 */
router.get('/evacuation', async (req, res, next) => {
    try {
        const { startLat, startLng, endLat, endLng } = req.query;

        if (!startLat || !startLng || !endLat || !endLng) {
            return res.status(400).json({ error: 'Missing startLat, startLng, endLat, or endLng' });
        }

        const sLat = parseFloat(startLat);
        const sLng = parseFloat(startLng);
        const eLat = parseFloat(endLat);
        const eLng = parseFloat(endLng);

        const orsApiKey = process.env.OPENROUTESERVICE_API_KEY || req.query.orsApiKey;

        let routeData = null;

        // 1. Try OpenRouteService if API key is present
        if (orsApiKey) {
            try {
                const orsUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${orsApiKey}&start=${sLng},${sLat}&end=${eLng},${eLat}`;
                const response = await fetch(orsUrl);
                if (response.ok) {
                    const data = await response.json();
                    const feature = data.features?.[0];
                    if (feature) {
                        const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]); // Leaflet format: [lat, lng]
                        const props = feature.properties.summary;
                        const steps = (feature.properties.segments?.[0]?.steps || []).map(s => ({
                            instruction: s.instruction,
                            distanceMeters: Math.round(s.distance),
                            durationSeconds: Math.round(s.duration)
                        }));

                        routeData = {
                            provider: 'OpenRouteService',
                            distanceKm: Math.round((props.distance / 1000) * 10) / 10,
                            durationMins: Math.round(props.duration / 60),
                            coordinates: coords,
                            steps
                        };
                    }
                }
            } catch (orsErr) {
                console.warn('[Routing Route] OpenRouteService call failed, falling back to OSRM:', orsErr.message);
            }
        }

        // 2. Fallback to OSRM Free Public API (No API key required)
        if (!routeData) {
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson&steps=true`;
            const response = await fetch(osrmUrl);
            if (!response.ok) {
                throw new Error(`OSRM API error ${response.status}`);
            }
            const data = await response.json();
            const route = data.routes?.[0];
            if (!route) {
                return res.status(404).json({ error: 'No route found between specified points' });
            }

            const coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // [lat, lng]
            const steps = (route.legs?.[0]?.steps || []).map(s => ({
                instruction: `${s.maneuver.type} ${s.maneuver.modifier || ''} onto ${s.name || 'road'}`.trim(),
                distanceMeters: Math.round(s.distance),
                durationSeconds: Math.round(s.duration)
            }));

            routeData = {
                provider: 'OpenStreetMap OSRM Engine',
                distanceKm: Math.round((route.distance / 1000) * 10) / 10,
                durationMins: Math.round(route.duration / 60),
                coordinates: coords,
                steps
            };
        }

        res.json(routeData);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
