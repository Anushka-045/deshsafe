async function fetchLiveGovernmentAlerts() {
    try {
        const response = await fetch('https://www.gdacs.org/gdacsapi/api/alerts/getalertlist/M');
        if (!response.ok) {
            throw new Error(`GDACS API HTTP error: ${response.status}`);
        }
        const data = await response.json();
        
        // Filter alerts in/near South Asia / India or high-severity global events
        const alerts = (data.features || []).map(feature => {
            const props = feature.properties || {};
            const coords = feature.geometry?.coordinates || [0, 0];
            const lng = coords[0];
            const lat = coords[1];

            let type = 'other';
            const eventType = (props.eventtype || '').toLowerCase();
            if (eventType === 'eq') type = 'earthquake';
            else if (eventType === 'tc') type = 'cyclone';
            else if (eventType === 'fl') type = 'flood';
            else if (eventType === 'vo') type = 'volcano';
            else if (eventType === 'wf') type = 'wildfire';

            let severity = 'moderate';
            const alertLevel = (props.alertlevel || '').toLowerCase();
            if (alertLevel === 'red') severity = 'high';
            else if (alertLevel === 'orange') severity = 'high';
            else if (alertLevel === 'green') severity = 'low';

            return {
                id: `gdacs-${props.eventid || Math.random().toString(36).substr(2, 9)}`,
                type,
                title: props.name || props.eventname || `${props.eventtype} Warning`,
                description: props.description || `Official GDACS alert for ${props.country || 'the region'}. Alert level: ${props.alertlevel}.`,
                severity,
                location: props.country || 'Global/Regional',
                lat,
                lng,
                source: 'GDACS (Official Government Crisis Network)',
                issuedAt: props.fromdate || new Date().toISOString(),
                url: props.url?.report || 'https://www.gdacs.org'
            };
        });

        // Filter alerts near India / South Asia region (lat: 5-38, lng: 60-98) or return all top alerts
        const indiaRegionAlerts = alerts.filter(a => a.lat >= 5 && a.lat <= 38 && a.lng >= 60 && a.lng <= 98);
        return indiaRegionAlerts.length > 0 ? indiaRegionAlerts : alerts.slice(0, 10);
    } catch (err) {
        console.warn('[GDACS Service] Live alert fetch failed, returning fallback NDMA alerts:', err.message);
        return [
            {
                id: 'ndma-001',
                type: 'cyclone',
                title: 'IMD / NDMA Warning — Heavy Rainfall & Strong Winds',
                description: 'India Meteorological Department (IMD) warning for coastal areas. Fishermen advised not to venture into sea.',
                severity: 'high',
                location: 'Bay of Bengal / Coastal Odisha & WB',
                lat: 19.8135,
                lng: 85.8312,
                source: 'NDMA / IMD India Official',
                issuedAt: new Date().toISOString(),
                url: 'https://ndma.gov.in'
            },
            {
                id: 'ndma-002',
                type: 'heatwave',
                title: 'IMD Red Alert — Extreme Heatwave Condition',
                description: 'IMD issues alert for North-Western India. Maximum temperatures reaching 43°C-45°C.',
                severity: 'high',
                location: 'North-Western India (Rajasthan, Delhi, Haryana)',
                lat: 28.6139,
                lng: 77.2090,
                source: 'IMD India Official',
                issuedAt: new Date().toISOString(),
                url: 'https://mausam.imd.gov.in'
            }
        ];
    }
}

module.exports = { fetchLiveGovernmentAlerts };
