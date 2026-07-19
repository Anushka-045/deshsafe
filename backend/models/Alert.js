const VALID_SEVERITY = ['info','warning','danger','critical'];
function createAlert({ adminId, title, message, severity, affectedStates, expiresAt, lat, lng, radiusKm }) {
    const now = new Date();
    return {
        adminId,
        title,
        message,
        severity,
        affectedStates,
        active: true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        radiusKm: typeof radiusKm === 'number' ? radiusKm : null,
        createdAt: now,
        updatedAt: now,
    };
}
function validateAlert(body) {
    const errors = [];
    if (!body.title || body.title.trim().length < 3)
        errors.push('"title" must be at least 3 characters');
    if (!body.message || body.message.trim().length < 10)
        errors.push('"message" must be at least 10 characters');
    if (!body.severity || !VALID_SEVERITY.includes(body.severity))
        errors.push(`"severity" must be one of: ${VALID_SEVERITY.join(', ')}`);
    if (!Array.isArray(body.affectedStates) || body.affectedStates.length === 0)
        errors.push('"affectedStates" must be a non-empty array of state names');

    // Geo-targeting is optional, but if any of lat/lng/radiusKm is provided, all three must be valid
    const hasAnyGeo = body.lat !== undefined || body.lng !== undefined || body.radiusKm !== undefined;
    if (hasAnyGeo) {
        if (typeof body.lat !== 'number' || body.lat < -90 || body.lat > 90)
            errors.push('"lat" must be a number between -90 and 90');
        if (typeof body.lng !== 'number' || body.lng < -180 || body.lng > 180)
            errors.push('"lng" must be a number between -180 and 180');
        if (typeof body.radiusKm !== 'number' || body.radiusKm <= 0)
            errors.push('"radiusKm" must be a positive number');
    }

    return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
module.exports = { createAlert, validateAlert, VALID_SEVERITY };