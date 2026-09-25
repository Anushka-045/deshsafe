// ═══════════════════════════════════════════
//  DeshSafe — map.js (Real Government Alerts, Community Upvotes & Evacuation Routing)
// ═══════════════════════════════════════════

const DEFAULT_CENTER = [28.6139, 77.2090]; // New Delhi

const severityColors = {
    low: '#48BB78',       // Green
    medium: '#FFB347',    // Orange
    moderate: '#FFB347',  // Orange
    high: '#FF6B6B',      // Red
    critical: '#8B0000'   // Dark Red
};

let activeMarkers = [];
let staticAlerts = [];
let currentMap = null;
let currentRoutePolyline = null;
let userCoords = DEFAULT_CENTER;

// Predefined Relief Shelters & Hospitals in India
const EMERGENCY_SHELTERS = [
    { id: 'sh-1', name: 'AIIMS Emergency & Disaster Center', lat: 28.5672, lng: 77.2100, type: 'Hospital & Shelter', city: 'Delhi' },
    { id: 'sh-2', name: 'NDRF Relief Camp — Connaught Place', lat: 28.6315, lng: 77.2167, type: 'Flood & Disaster Shelter', city: 'Delhi' },
    { id: 'sh-3', name: 'Rohini Red Cross Relief Center', lat: 28.7041, lng: 77.1025, type: 'Relief & Food Station', city: 'North Delhi' },
    { id: 'sh-4', name: 'KEM Hospital Emergency Unit', lat: 19.0024, lng: 72.8424, type: 'Hospital & Trauma Center', city: 'Mumbai' },
    { id: 'sh-5', name: 'Odisha Disaster Management Shelter', lat: 20.2961, lng: 85.8245, type: 'Cyclone & Flood Shelter', city: 'Bhubaneswar' }
];

function getMarkerIcon(severity) {
    const color = severityColors[severity] || 'gray';
    return L.divIcon({
        className: `marker-${severity || 'unknown'}`,
        html: `<div style="
            background: ${color};
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid #fff;
            box-shadow: 0 0 6px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

function getShelterIcon() {
    return L.divIcon({
        className: 'marker-shelter',
        html: `<div style="
            background: #2563EB;
            color: #fff;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #fff;
            box-shadow: 0 0 6px rgba(0,0,0,0.4);
            font-size: 12px;
        "><i class="fa-solid fa-hospital"></i></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

function addIncidentMarker(map, incident) {
    if (incident.lat == null || incident.lng == null) return null;

    const marker = L.marker([incident.lat, incident.lng], {
        icon: incident.isShelter ? getShelterIcon() : getMarkerIcon(incident.severity)
    }).addTo(map);

    if (incident.id) marker._deshSafeId = incident.id;

    const severity = (incident.severity || 'unknown').toLowerCase();
    const typeLabel = (incident.type || 'incident').replace('_', ' ').toUpperCase();
    const statusText = (incident.status || 'active').toUpperCase();
    const upvotes = incident.upvotes || 1;

    const popupContent = document.createElement('div');
    popupContent.style.cssText = 'font-family: inherit; min-width: 220px;';
    popupContent.innerHTML = `
        <strong style="display: block; font-size: 14px; color: var(--text-dark, #1e293b); margin-bottom: 4px;">
            ${incident.isShelter ? '🏥 Safe Shelter' : `${typeLabel}: ${incident.title || 'Report'}`}
        </strong>
        ${incident.isShelter ? '' : `<span class="severity-badge ${severity}" style="margin-left: 0; margin-bottom: 6px;">${severity.toUpperCase()}</span>`}
        <p style="font-size: 12.5px; color: var(--text-mid, #475569); margin: 6px 0; line-height: 1.4;">
            ${incident.description || 'No description provided.'}
        </p>
        <div style="font-size: 11px; margin-top: 6px; color: #64748b; display: flex; flex-direction: column; gap: 3px;">
            <span><i class="fa-solid fa-location-dot"></i> ${incident.location || 'Unknown location'}</span>
            ${incident.isShelter ? '' : `<span><i class="fa-solid fa-shield-halved"></i> Source: <strong>${incident.source || 'Community'}</strong></span>`}
            ${incident.isShelter ? '' : `<span><i class="fa-solid fa-thumbs-up"></i> Verified by <strong><span class="upvote-count-${incident.id}">${upvotes}</span> citizens</strong></span>`}
        </div>
        <div style="display: flex; gap: 6px; margin-top: 10px;">
            ${!incident.isShelter ? `<button class="btn-upvote" style="flex: 1; padding: 5px 8px; font-size: 11px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; border-radius: 4px; cursor: pointer; font-weight: 600;">👍 Upvote (${upvotes})</button>` : ''}
            <button class="btn-evacuate" style="flex: 1; padding: 5px 8px; font-size: 11px; background: #dc2626; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">🚗 Evacuate Route</button>
        </div>
    `;

    // Handle Upvote Button Click
    const upvoteBtn = popupContent.querySelector('.btn-upvote');
    if (upvoteBtn && incident.id) {
        upvoteBtn.addEventListener('click', async () => {
            const apiBase = window.DeshSafeConfig?.API_BASE_URL || 'http://localhost:3001';
            try {
                const res = await fetch(`${apiBase}/api/reports/${incident.id}/upvote`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    const countEl = popupContent.querySelector(`.upvote-count-${incident.id}`);
                    if (countEl) countEl.textContent = data.upvotes;
                    upvoteBtn.textContent = `✅ Upvoted (${data.upvotes})`;
                    upvoteBtn.disabled = true;
                }
            } catch (e) {
                console.warn('Upvote failed:', e);
            }
        });
    }

    // Handle Evacuation Route Button Click (OpenRouteService / OSRM API)
    const evacBtn = popupContent.querySelector('.btn-evacuate');
    if (evacBtn) {
        evacBtn.addEventListener('click', () => {
            getEvacuationRoute(userCoords[0], userCoords[1], incident.lat, incident.lng, incident.title || incident.name);
        });
    }

    marker.bindPopup(popupContent);
    return marker;
}

// Fetch Evacuation Route from OpenRouteService / OSRM Backend API
async function getEvacuationRoute(startLat, startLng, endLat, endLng, destinationName) {
    const apiBase = window.DeshSafeConfig?.API_BASE_URL || 'http://localhost:3001';
    const routeUrl = `${apiBase}/api/routing/evacuation?startLat=${startLat}&startLng=${startLng}&endLat=${endLat}&endLng=${endLng}`;

    try {
        const res = await fetch(routeUrl);
        if (!res.ok) throw new Error('Routing request failed');
        const data = await res.json();

        if (currentRoutePolyline && currentMap) {
            currentMap.removeLayer(currentRoutePolyline);
        }

        // Draw Route Polyline
        currentRoutePolyline = L.polyline(data.coordinates, {
            color: '#2563eb',
            weight: 5,
            opacity: 0.8,
            dashArray: '10, 5'
        }).addTo(currentMap);

        currentMap.fitBounds(currentRoutePolyline.getBounds(), { padding: [40, 40] });

        // Show Turn-by-Turn Directions Panel
        showDirectionsPanel(destinationName, data);
    } catch (e) {
        console.error('Evacuation routing error:', e);
        alert('Could not compute evacuation route. Direct straight line displayed.');
        if (currentRoutePolyline && currentMap) currentMap.removeLayer(currentRoutePolyline);
        currentRoutePolyline = L.polyline([[startLat, startLng], [endLat, endLng]], { color: '#dc2626', weight: 4 }).addTo(currentMap);
    }
}

function showDirectionsPanel(destName, data) {
    let panel = document.getElementById('evacuation-directions-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'evacuation-directions-panel';
        panel.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            width: 320px;
            max-height: 350px;
            background: #ffffff;
            color: #1e293b;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            padding: 15px;
            z-index: 1000;
            overflow-y: auto;
            font-size: 12.5px;
            border-left: 5px solid #2563eb;
        `;
        document.body.appendChild(panel);
    }

    const stepsHTML = (data.steps || []).map((s, idx) => `
        <div style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; display: flex; gap: 8px;">
            <span style="font-weight: bold; color: #2563eb;">${idx + 1}.</span>
            <div>
                <div>${s.instruction}</div>
                <div style="font-size: 11px; color: #64748b;">${s.distanceMeters}m · ${Math.round(s.durationSeconds / 60)} mins</div>
            </div>
        </div>
    `).join('');

    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 14px; color: #1e293b;">🚗 Evacuation Route</strong>
            <button onclick="document.getElementById('evacuation-directions-panel').remove()" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b;">✕</button>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #475569;">
            Destination: <strong>${destName}</strong><br>
            Distance: <strong>${data.distanceKm} km</strong> · Approx Time: <strong>${data.durationMins} mins</strong><br>
            <span style="font-size: 10.5px; color: #0284c7;">Powered by ${data.provider}</span>
        </p>
        <div style="max-height: 200px; overflow-y: auto;">
            ${stepsHTML || '<p style="color:#64748b;">Follow straight road to destination.</p>'}
        </div>
    `;
}

async function fetchAndPlotIncidents(map) {
    const type = document.getElementById('filter-type')?.value || '';
    const severity = document.getElementById('filter-severity')?.value || '';

    activeMarkers.forEach(m => map.removeLayer(m));
    activeMarkers = [];

    // 1. Plot Emergency Relief Shelters
    EMERGENCY_SHELTERS.forEach(shelter => {
        const marker = addIncidentMarker(map, {
            title: shelter.name,
            type: 'shelter',
            description: `Safe emergency shelter & relief facility in ${shelter.city}.`,
            location: `${shelter.city}, India`,
            severity: 'low',
            lat: shelter.lat,
            lng: shelter.lng,
            isShelter: true
        });
        if (marker) activeMarkers.push(marker);
    });

    // 2. Fetch Live Real-time Government Alerts (GDACS / NDMA)
    const apiBase = window.DeshSafeConfig?.API_BASE_URL || 'http://localhost:3001';
    try {
        const govRes = await fetch(`${apiBase}/api/alerts/live-government`);
        if (govRes.ok) {
            const govData = await govRes.json();
            (govData.alerts || []).forEach(alert => {
                const marker = addIncidentMarker(map, {
                    id: alert.id,
                    title: alert.title,
                    type: alert.type,
                    description: alert.description,
                    location: alert.location,
                    severity: alert.severity,
                    lat: alert.lat,
                    lng: alert.lng,
                    source: alert.source || 'GDACS Official',
                    upvotes: 25,
                    createdAt: alert.issuedAt
                });
                if (marker) activeMarkers.push(marker);
            });
        }
    } catch (e) {
        console.warn('Could not fetch government alerts:', e);
    }

    // 3. Fetch Database Community Reports
    try {
        let url = `${apiBase}/api/reports?limit=100`;
        if (type) url += `&type=${encodeURIComponent(type)}`;
        if (severity) url += `&severity=${encodeURIComponent(severity)}`;

        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            (data.reports || []).forEach(report => {
                if (report.location && report.location.lat != null && report.location.lng != null) {
                    const marker = addIncidentMarker(map, {
                        id: report._id,
                        title: report.description ? (report.description.substring(0, 30) + '...') : 'Community Report',
                        type: report.type,
                        description: report.description,
                        location: report.location.address || `${report.location.lat}, ${report.location.lng}`,
                        severity: report.severity,
                        lat: report.location.lat,
                        lng: report.location.lng,
                        upvotes: report.upvotes || 1,
                        createdAt: report.createdAt,
                        status: report.status
                    });
                    if (marker) activeMarkers.push(marker);
                }
            });
        }
    } catch (err) {
        console.warn('Failed to load community reports:', err);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const mapEl = document.getElementById('incident-map');
    if (!mapEl || typeof L === 'undefined') return;

    const map = L.map('incident-map').setView(DEFAULT_CENTER, 11);
    currentMap = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userCoords = [position.coords.latitude, position.coords.longitude];
                map.setView(userCoords, 12);
                L.marker(userCoords, {
                    icon: L.divIcon({
                        className: 'user-pin',
                        html: '<div style="background:#2563eb;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px #2563eb;"></div>',
                        iconSize: [14, 14], iconAnchor: [7, 7]
                    })
                }).addTo(map).bindPopup('📍 Your Current Location');
            },
            (error) => console.warn('Geolocation unavailable:', error.message),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }

    await fetchAndPlotIncidents(map);

    document.getElementById('btn-apply-filters')?.addEventListener('click', () => fetchAndPlotIncidents(map));
    document.getElementById('btn-reset-filters')?.addEventListener('click', () => fetchAndPlotIncidents(map));
});
