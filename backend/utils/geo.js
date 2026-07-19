const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

function distanceKm(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
}

function parseCoord(value, name) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        const err = new Error(`Invalid ${name}: must be a number`);
        err.status = 400;
        throw err;
    }
    return num;
}

function parseNearbyQuery(query, defaultRadiusKm = 25, maxRadiusKm = 200) {
    const { lat, lng, radiusKm } = query;
    if (lat == null || lng == null) {
        const err = new Error('Query parameters "lat" and "lng" are required');
        err.status = 400;
        throw err;
    }
    const latitude = parseCoord(lat, 'lat');
    const longitude = parseCoord(lng, 'lng');
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        const err = new Error('Coordinates out of valid range');
        err.status = 400;
        throw err;
    }
    let radius = radiusKm != null ? Number(radiusKm) : defaultRadiusKm;
    if (!Number.isFinite(radius) || radius <= 0) radius = defaultRadiusKm;
    radius = Math.min(radius, maxRadiusKm);
    return { latitude, longitude, radius };
}

module.exports = { distanceKm, parseNearbyQuery };