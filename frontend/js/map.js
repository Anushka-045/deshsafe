// ═══════════════════════════════════════════
//  DeshSafe — map.js
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

// Colour-coded divIcon for an incident marker, based on its severity level
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
            box-shadow: 0 0 4px rgba(0,0,0,0.45);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

function addIncidentMarker(map, incident) {
    if (incident.lat == null || incident.lng == null) return null;

    const marker = L.marker([incident.lat, incident.lng], {
        icon: getMarkerIcon(incident.severity)
    }).addTo(map);

    // Store ID on marker for real-time update lookups
    if (incident.id) marker._deshSafeId = incident.id;

    const severity = (incident.severity || 'unknown').toLowerCase();
    const typeLabel = (incident.type || 'incident').replace('_', ' ').toUpperCase();
    const statusText = (incident.status || 'active').toUpperCase();
    const timeFormatted = incident.createdAt 
        ? (typeof formatReportTime === 'function' ? formatReportTime(incident.createdAt) : new Date(incident.createdAt).toLocaleString()) 
        : 'Just now';

    marker.bindPopup(`
        <div style="font-family: inherit; min-width: 200px;">
            <strong style="display: block; font-size: 13.5px; color: var(--text-dark); margin-bottom: 4px;">
                ${typeLabel}: ${incident.title || 'Report'}
            </strong>
            <span class="severity-badge ${severity}" style="margin-left: 0; margin-bottom: 6px;">${severity.toUpperCase()}</span>
            <p style="font-size: 12.5px; color: var(--text-mid); margin: 6px 0; line-height: 1.5;">
                ${incident.description || 'No description provided.'}
            </p>
            <div style="font-size: 11px; margin-top: 8px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
                <span><i class="fa-solid fa-clock"></i> Reported: ${timeFormatted}</span>
                <span><i class="fa-solid fa-location-dot"></i> ${incident.location || 'Unknown location'}</span>
                <span><i class="fa-solid fa-circle-info"></i> Status: <span class="status-${severity}" style="font-weight: 700; color: ${severityColors[severity] || 'gray'};">${statusText}</span></span>
            </div>
        </div>
    `);

    return marker;
}

async function fetchAndPlotIncidents(map) {
    const type = document.getElementById('filter-type')?.value || '';
    const severity = document.getElementById('filter-severity')?.value || '';
    const startDate = document.getElementById('filter-start-date')?.value || '';
    const endDate = document.getElementById('filter-end-date')?.value || '';

    // Clear existing markers from the map
    activeMarkers.forEach(m => map.removeLayer(m));
    activeMarkers = [];

    // Plot filtered agency/weather alerts first
    staticAlerts.forEach(alert => {
        const typeMatch = !type || alert.type === type;
        const severityMatch = !severity || alert.severity === severity;
        if (typeMatch && severityMatch) {
            const marker = addIncidentMarker(map, {
                title: alert.title,
                type: alert.type,
                description: alert.description,
                location: alert.location,
                severity: alert.severity,
                lat: alert.lat,
                lng: alert.lng,
                createdAt: new Date().toISOString(),
                status: 'verified'
            });
            if (marker) activeMarkers.push(marker);
        }
    });

    // Plot local/device reports stored in LocalStorage (e.g., submitted offline)
    const localReports = typeof getStoredReports === 'function' ? getStoredReports() : [];
    localReports.forEach(report => {
        const reportType = (report.type || '').toLowerCase();
        // Map frontend types to backend types for matching
        const typeMapping = {
            'heatwave': 'heatwave',
            'flood': 'flood',
            'fire': 'fire',
            'storm / cyclone': 'cyclone',
            'building collapse': 'other',
            'other crisis': 'other'
        };
        const mappedType = typeMapping[reportType] || reportType;
        const typeMatch = !type || mappedType === type;
        const severityMatch = !severity || report.severity === severity;

        const reportTime = report.submittedAt ? new Date(report.submittedAt).getTime() : Date.now();
        const startMatch = !startDate || reportTime >= new Date(startDate).getTime();
        let endMatch = true;
        if (endDate) {
            const endLimit = new Date(endDate);
            endLimit.setHours(23, 59, 59, 999);
            endMatch = reportTime <= endLimit.getTime();
        }

        if (typeMatch && severityMatch && startMatch && endMatch) {
            const hasCoords = report.lat != null && report.lng != null;
            const [lat, lng] = hasCoords ? [report.lat, report.lng] : DEFAULT_CENTER;
            const marker = addIncidentMarker(map, {
                title: report.title,
                type: mappedType,
                description: report.description,
                location: report.location,
                severity: report.severity,
                lat,
                lng,
                createdAt: report.submittedAt || new Date().toISOString(),
                status: 'submitted'
            });
            if (marker) activeMarkers.push(marker);
        }
    });

    const apiBase = window.DeshSafeConfig?.API_BASE_URL || 'http://localhost:3001';
    let url = `${apiBase}/api/reports?limit=100`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (severity) url += `&severity=${encodeURIComponent(severity)}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('API fetch failed');
        const data = await response.json();

        // Plot database community reports
        const reports = data.reports || [];
        reports.forEach(report => {
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
                    createdAt: report.createdAt,
                    status: report.status
                });
                if (marker) activeMarkers.push(marker);
            }
        });
    } catch (err) {
        console.warn('Failed to load incident reports from backend API:', err);
        showMapErrorBanner();
    }
}

function loadGoogleMapsScript(apiKey) {
    if (!apiKey || apiKey === 'your_google_maps_api_key_here') return Promise.reject(new Error('No Google Maps API key'));
    if (window.google?.maps) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Google Maps'));
        document.head.appendChild(script);
    });
}

function addMapTileLayer(map) {
    const apiKey = window.DeshSafeConfig?.GOOGLE_MAPS_API_KEY;

    if (apiKey && typeof L.gridLayer?.googleMutant === 'function') {
        return loadGoogleMapsScript(apiKey).then(() => {
            L.gridLayer.googleMutant({ type: 'roadmap' }).addTo(map);
        });
    }

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    return Promise.resolve();
}

document.addEventListener('DOMContentLoaded', async () => {
    const mapEl = document.getElementById('incident-map');
    if (!mapEl || typeof L === 'undefined') return;

    const map = L.map('incident-map').setView(DEFAULT_CENTER, 11);

    try {
        await addMapTileLayer(map);
    } catch (err) {
        console.warn('Google Maps unavailable, using OpenStreetMap:', err);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);
    }

    // Geolocation: Auto-center on user's current GPS location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 13);
            },
            (error) => {
                console.warn('[Geolocation] Permission denied or unavailable:', error.message);
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }

    try {
        // Fetch static alerts first
        const data = await window.DeshSafe.fetchAlertsAndWeather();
        staticAlerts = data.active_alerts || [];
    } catch (err) {
        console.error('Failed to load static alerts:', err);
    }

    // Fetch and plot reports initially
    try {
        await fetchAndPlotIncidents(map);
    } catch (err) {
        console.error('Initial load failed:', err);
        showMapErrorBanner(`JS Error on load: ${err.message}`);
    }

    // Setup Filter Event Listeners
    document.getElementById('btn-apply-filters')?.addEventListener('click', async () => {
        try {
            await fetchAndPlotIncidents(map);
        } catch (err) {
            console.error('Filter apply failed:', err);
            alert(`Failed to apply filters: ${err.message}`);
        }
    });

    document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
        const filterType = document.getElementById('filter-type');
        const filterSeverity = document.getElementById('filter-severity');
        const filterStartDate = document.getElementById('filter-start-date');
        const filterEndDate = document.getElementById('filter-end-date');

        if (filterType) filterType.value = '';
        if (filterSeverity) filterSeverity.value = '';
        if (filterStartDate) filterStartDate.value = '';
        if (filterEndDate) filterEndDate.value = '';

        fetchAndPlotIncidents(map);
    });

    // Socket.io Client Setup for Real-time Incidents
    const apiBase = window.DeshSafeConfig?.API_BASE_URL || 'http://localhost:3001';
    try {
        if (typeof io !== 'undefined') {
            const socket = io(apiBase);

            socket.on('connect', () => {
                console.log('[Socket.io] Connected to backend events server');

                // Join region room based on stored location
                const savedState = localStorage.getItem('deshsafe_location_state');
                if (savedState) {
                    socket.emit('join-region', savedState);
                    console.log('[Socket.io] Joined region room:', savedState);
                }
            });

            // New incident reported — add marker to map
            socket.on('new-incident', (report) => {
                console.log('[Socket.io] Real-time incident received:', report);

                const filterType = document.getElementById('filter-type')?.value;
                const filterSeverity = document.getElementById('filter-severity')?.value;
                const filterStartDate = document.getElementById('filter-start-date')?.value;
                const filterEndDate = document.getElementById('filter-end-date')?.value;

                const typeMatch = !filterType || report.type === filterType;
                const severityMatch = !filterSeverity || report.severity === filterSeverity;
                
                const reportTime = new Date(report.createdAt).getTime();
                const startMatch = !filterStartDate || reportTime >= new Date(filterStartDate).getTime();
                
                let endMatch = true;
                if (filterEndDate) {
                    const endLimit = new Date(filterEndDate);
                    endLimit.setHours(23, 59, 59, 999);
                    endMatch = reportTime <= endLimit.getTime();
                }

                if (typeMatch && severityMatch && startMatch && endMatch) {
                    if (report.location && report.location.lat != null && report.location.lng != null) {
                        // Avoid duplicates
                        const alreadyExists = activeMarkers.some(m => {
                            const latlng = m.getLatLng();
                            return Math.abs(latlng.lat - report.location.lat) < 0.0001 && 
                                   Math.abs(latlng.lng - report.location.lng) < 0.0001;
                        });

                        if (!alreadyExists) {
                            const marker = addIncidentMarker(map, {
                                id: report._id,
                                title: report.description ? (report.description.substring(0, 30) + '...') : 'Community Report',
                                type: report.type,
                                description: report.description,
                                location: report.location.address || `${report.location.lat}, ${report.location.lng}`,
                                severity: report.severity,
                                lat: report.location.lat,
                                lng: report.location.lng,
                                createdAt: report.createdAt,
                                status: report.status
                            });
                            if (marker) {
                                activeMarkers.push(marker);
                                marker.openPopup();
                            }
                        }
                    }
                }
            });

            // Status update on an existing incident — update marker appearance
            socket.on('alert-update', (data) => {
                console.log('[Socket.io] Alert update received:', data);

                if (data.type === 'alert') return; // handled by new-alert

                // Find and update existing marker
                const marker = activeMarkers.find(m => {
                    if (!m._deshSafeId) return false;
                    return m._deshSafeId === data._id;
                });

                if (marker) {
                    // Update marker icon with new severity
                    marker.setIcon(getMarkerIcon(data.severity));

                    // Update popup content
                    const severity = (data.severity || 'unknown').toLowerCase();
                    const typeLabel = (data.type || 'incident').replace('_', ' ').toUpperCase();
                    const statusText = (data.status || 'active').toUpperCase();
                    const timeFormatted = data.updatedAt
                        ? new Date(data.updatedAt).toLocaleString()
                        : 'Just now';

                    marker.setPopupContent(`
                        <div style="font-family: inherit; min-width: 200px;">
                            <strong style="display: block; font-size: 13.5px; color: var(--text-dark); margin-bottom: 4px;">
                                ${typeLabel}: ${data.description ? data.description.substring(0, 30) + '...' : 'Report'}
                            </strong>
                            <span class="severity-badge ${severity}" style="margin-left: 0; margin-bottom: 6px;">${severity.toUpperCase()}</span>
                            <p style="font-size: 12.5px; color: var(--text-mid); margin: 6px 0; line-height: 1.5;">
                                ${data.description || 'No description provided.'}
                            </p>
                            <div style="font-size: 11px; margin-top: 8px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
                                <span><i class="fa-solid fa-clock"></i> Updated: ${timeFormatted}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${data.location ? (data.location.address || `${data.location.lat}, ${data.location.lng}`) : 'Unknown location'}</span>
                                <span><i class="fa-solid fa-circle-info"></i> Status: <span class="status-${severity}" style="font-weight: 700; color: ${severityColors[severity] || 'gray'};">${statusText}</span></span>
                            </div>
                        </div>
                    `);
                }
            });

            // Admin created a new alert
            socket.on('new-alert', (alert) => {
                console.log('[Socket.io] New admin alert received:', alert);
                if (alert.location && alert.location.lat != null && alert.location.lng != null) {
                    const marker = addIncidentMarker(map, {
                        id: alert._id,
                        title: alert.title || 'Alert',
                        type: alert.type || 'alert',
                        description: alert.message || alert.description || '',
                        location: alert.location || '',
                        severity: alert.severity || 'medium',
                        lat: alert.location.lat,
                        lng: alert.location.lng,
                        createdAt: alert.createdAt || new Date().toISOString(),
                        status: 'verified'
                    });
                    if (marker) {
                        activeMarkers.push(marker);
                        marker.openPopup();
                    }
                }
            });

            // Alert deleted — remove marker from map
            socket.on('alert-deleted', (data) => {
                console.log('[Socket.io] Alert deleted:', data._id);
                const index = activeMarkers.findIndex(m => m._deshSafeId === data._id);
                if (index !== -1) {
                    map.removeLayer(activeMarkers[index]);
                    activeMarkers.splice(index, 1);
                }
            });
        }
    } catch (err) {
        console.warn('Socket.io client connection failed:', err);
    }
});

// User-facing fallback if alerts/reports fail to load entirely
function showMapErrorBanner(customMessage) {
    // Avoid double banners
    if (document.querySelector('.map-error-banner')) return;
    
    const container = document.querySelector('.map-page-container');
    if (!container) return;
    const banner = document.createElement('div');
    banner.className = 'map-error-banner';
    banner.textContent = customMessage || 'Unable to connect to live incident service. Showing static/cached reports.';
    container.prepend(banner);
}
