// Update the greeting date dynamically
function updateDate() {
    const now=new Date();
    const options={weekday:'long', year:'numeric', month:'long', day:'numeric'};
    const dateString = now.toLocaleDateString('en-IN', options);
    document.getElementById('greeting-date').innerHTML = 
        dateString + ' · Stay safe today — <span id="alert-count">2</span> active alerts in ' + (localStorage.getItem('deshsafe_location') || 'your area');
}

if(document.getElementById('greeting-date')) {
    updateDate();
}

// Simulate real-time data updates (for demo purposes)
function animateCounter(id, target, suffix) {
    let current = 0;
    const element = document.getElementById(id);
    const timer = setInterval(function() {
        current++;
        element.innerHTML = current + suffix;
        if(current === target) {
            clearInterval(timer);
        }
    }, 30);
}

// Scroll animation for feature cards
const observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
if(entry.isIntersecting) {
    entry.target.classList.add('visible');
} else {
    entry.target.classList.remove('visible');
}
    });
}, { threshold: 0.1});

document.querySelectorAll('.feature-card').forEach(function(card) {
    observer.observe(card);
});

//steps
const steps = document.querySelectorAll('.step-item');
const STORAGE_KEY = 'completedSteps';
function updateProgress() {
    const total = steps.length;
    const completed = document.querySelectorAll('.step-item.completed').length;
    const percent = Math.round((completed / total) * 100);
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('progress-percent');
    
    if(fill && label) {
        fill.style.width = percent + '%';
        label.innerHTML = percent + '%';
    }
}
steps.forEach(function(step) {
    step.addEventListener('click', function() {
        step.classList.toggle('completed');
        saveSteps();
        updateProgress();
    });
});
loadSteps();
function saveSteps() {
    const completedIndices = [];
    steps.forEach((step, index) => {
        if (step.classList.contains('completed')) {
            completedIndices.push(index);
        }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedIndices));
}

function loadSteps() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    saved.forEach(index => {
        if (steps[index]) {
            steps[index].classList.add('completed');
        }
    });
    updateProgress();
}

/// ── Dark Mode ──
(function () {
    var STORAGE_KEY = 'deshsafe-theme';

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
    }

    function getPreferred() {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    applyTheme(getPreferred());

    window.toggleDarkMode = function () {
        var current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'dark' ? 'light' : 'dark');
    };
})();

// Helper function to get initials from a name (shared globally)
function getInitials(name) {
    if (!name) return 'DS';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Auto Location Detection (High-Precision GPS + IP Fallback) ──
async function detectAndSetLocation() {
    const cached = localStorage.getItem('deshsafe_location');
    const cachedTime = localStorage.getItem('deshsafe_location_time');
    const THIRTY_MINS = 30 * 60 * 1000;

    if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < THIRTY_MINS && cached !== 'India' && cached !== 'Gurgaon, Haryana') {
        _updateLocationUI(cached);
        if (document.getElementById('greeting-date')) updateDate();
        return cached;
    }

    // 1. Try High-Precision Browser GPS Geolocation first
    if (navigator.geolocation) {
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 6000,
                    maximumAge: 0
                });
            });

            const { latitude, longitude } = position.coords;
            localStorage.setItem('deshsafe_lat', latitude.toString());
            localStorage.setItem('deshsafe_lng', longitude.toString());

            // Reverse geocode GPS coordinates for exact neighborhood / city
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
            if (geoRes.ok) {
                const geoData = await geoRes.json();
                const addr = geoData.address || {};
                const suburb = addr.suburb || addr.neighbourhood || addr.residential || addr.subdistrict || addr.district || addr.city_district;
                const city = addr.city || addr.town || addr.state_district || addr.state || 'Delhi';
                
                const locationStr = suburb ? `${suburb}, ${city}` : (geoData.display_name ? geoData.display_name.split(',').slice(0, 2).join(',') : `${city}, India`);
                
                localStorage.setItem('deshsafe_location', locationStr);
                localStorage.setItem('deshsafe_location_time', Date.now().toString());
                _updateLocationUI(locationStr);
                if (document.getElementById('greeting-date')) updateDate();
                return locationStr;
            }
        } catch (gpsErr) {
            console.warn('[Location] GPS lookup skipped/failed, falling back to IP:', gpsErr.message);
        }
    }

    // 2. IP-based lookup fallback if GPS unavailable
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();

        if (data && data.city) {
            const locationStr = `${data.city}, ${data.region}`;
            localStorage.setItem('deshsafe_location', locationStr);
            localStorage.setItem('deshsafe_location_time', Date.now().toString());
            if (data.latitude) localStorage.setItem('deshsafe_lat', data.latitude);
            if (data.longitude) localStorage.setItem('deshsafe_lng', data.longitude);
            _updateLocationUI(locationStr);
            if (document.getElementById('greeting-date')) updateDate();
            return locationStr;
        }
    } catch (e) {
        console.warn('Could not detect location via IP:', e);
    }

    _updateLocationUI('Delhi, India');
    return 'Delhi, India';
}

function _updateLocationUI(locationStr) {
    document.querySelectorAll('.nav-location').forEach(el => {
        el.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${locationStr}`;
    });
}

// ── Consolidated Data Integration Layer (Single Source of Truth) ──
window.DeshSafe = {
    currentUser: null,

    async getProfile() {
        // 1. Try local storage cache first
        const cachedStr = localStorage.getItem('deshsafe_user_profile');
        let profile = cachedStr ? JSON.parse(cachedStr) : null;

        if (this.currentUser) {
            try {
                const { getProfile } = await import('./firebase.js');
                const cloudProfile = await getProfile(this.currentUser.uid);
                if (cloudProfile && cloudProfile.name) {
                    profile = { ...profile, ...cloudProfile };
                }
            } catch (e) {
                console.warn('Could not fetch Firestore profile:', e);
            }
        }

        const defaultName = (this.currentUser && (this.currentUser.displayName || (this.currentUser.email ? this.currentUser.email.split('@')[0] : null))) || 'Anushka';

        if (!profile) {
            profile = {
                name: defaultName,
                age: '21',
                phone: '',
                familySize: '4 members',
                location: localStorage.getItem('deshsafe_location') || 'Rohini, Delhi',
                healthTags: [],
                preferences: { heatwave: true, flood: true, aqi: true, earthquake: false }
            };
        }

        if (!profile.name || profile.name === 'Guest') {
            profile.name = defaultName;
        }

        return profile;
    },

    async saveProfile(profileData) {
        // Always persist to localStorage so it is remembered permanently
        localStorage.setItem('deshsafe_user_profile', JSON.stringify(profileData));
        if (profileData.location) {
            localStorage.setItem('deshsafe_location', profileData.location);
        }

        if (this.currentUser) {
            try {
                const { saveProfile } = await import('./firebase.js');
                await saveProfile(this.currentUser.uid, profileData);
            } catch (e) {
                console.error('Error saving profile to Firestore:', e);
            }
        }
        window.dispatchEvent(new CustomEvent('deshsafe-profile-update', { detail: profileData }));
        this.syncUIWithProfile(profileData);
    },

    async getReports() {
        if (this.currentUser) {
            try {
                const { getUserReports } = await import('./firebase.js');
                return await getUserReports(this.currentUser.uid);
            } catch (e) {
                console.error('Error fetching reports from Firestore:', e);
            }
        }
        return [];
    },

    async saveReport(report) {
        const apiBase = window.DeshSafeConfig?.API_BASE_URL || 'http://localhost:3001';
        let token = null;
        if (this.currentUser) {
            try {
                token = await this.currentUser.getIdToken();
            } catch (e) {
                console.warn('Failed to get Firebase token:', e);
            }
        }

        let dbSuccess = false;
        let apiSuccess = false;

        // 1. Try Firestore if user logged in
        if (this.currentUser) {
            try {
                const { saveReport } = await import('./firebase.js');
                await saveReport(this.currentUser.uid, report);
                window.dispatchEvent(new CustomEvent('deshsafe-reports-update'));
                dbSuccess = true;
            } catch (e) {
                console.warn('Failed to save to Firestore:', e);
            }
        }

        // 2. Try backend API POST /api/reports (Guests allowed)
        try {
            const typeMapping = {
                'heatwave': 'heatwave',
                'flood': 'flood',
                'fire': 'fire',
                'storm / cyclone': 'cyclone',
                'building collapse': 'other',
                'other crisis': 'other'
            };
            const mappedType = typeMapping[(report.type || '').toLowerCase()] || 'other';

            const payload = {
                type: mappedType,
                severity: report.severity || 'medium',
                description: `${report.title || 'No Title'}\n\n${report.description || ''}`.trim(),
                location: {
                    lat: report.lat || 0,
                    lng: report.lng || 0,
                    address: report.location || 'Unknown',
                    district: report.district || null,
                    state: report.state || null
                },
                photoUrl: report.photo || null
            };

            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${apiBase}/api/reports`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (res.status === 201 || res.status === 200) {
                apiSuccess = true;
            }
        } catch (e) {
            console.warn('Failed to POST report to API:', e);
        }

        if (!dbSuccess && !apiSuccess) {
            // Save locally in IndexedDB / LocalStorage queue
            saveReport(report); // local fallback
        }
    },

    async fetchAlertsAndWeather() {
        const liveWeather = await this.fetchLiveWeather();
        const apiBase = window.DeshSafeConfig?.API_BASE_URL || 'http://localhost:3001';
        let govAlerts = [];

        try {
            const govRes = await fetch(`${apiBase}/api/alerts/live-government`);
            if (govRes.ok) {
                const govData = await govRes.json();
                govAlerts = govData.alerts || [];
            }
        } catch (e) {
            console.warn('Could not fetch government alerts:', e);
        }

        // Dynamically build active alerts based on live weather and real government alerts
        const active_alerts = [];

        if (govAlerts.length > 0) {
            govAlerts.forEach(ga => active_alerts.push({
                id: ga.id,
                type: ga.type,
                title: ga.title,
                description: ga.description,
                severity: ga.severity,
                location: ga.location,
                lat: ga.lat,
                lng: ga.lng,
                tags: ['Official Government Warning', 'IMD / GDACS Bulletin']
            }));
        }

        const tempC = liveWeather ? liveWeather.temperature_c : 24;
        const loc = localStorage.getItem('deshsafe_location') || 'Rohini, Delhi';

        if (tempC >= 40) {
            active_alerts.push({
                id: 'live-heat-alert',
                type: 'heatwave',
                title: `Extreme Heatwave Advisory — ${loc}`,
                description: `High temperature recorded (${tempC}°C). Stay indoors between 11 AM – 5 PM and stay hydrated.`,
                severity: 'high',
                location: loc,
                tags: ['Drink water hourly', 'Stay indoors 11am-5pm', 'Watch for heatstroke']
            });
        } else {
            active_alerts.push({
                id: 'live-weather-advisory',
                type: 'air_quality',
                title: `Current Weather Advisory — ${loc}`,
                description: `Live temperature is ${tempC}°C with ${liveWeather ? liveWeather.condition : 'Clear sky'}. No extreme heatwave warning in effect.`,
                severity: 'low',
                location: loc,
                tags: ['Normal Weather', 'Stay Hydrated', 'Check AQI']
            });
        }

        return {
            meta: { location: loc, last_updated: new Date().toISOString() },
            active_alerts,
            weather: liveWeather || {
                temperature_c: 24,
                feels_like_c: 25,
                humidity_percent: 78,
                aqi: 2,
                wind_kmh: 13,
                uv_index: 2,
                condition: 'Clear Sky',
                sunrise: '06:11',
                sunset: '18:15'
            },
            community_reports: []
        };
    },

    _withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out after ' + ms + 'ms')), ms))
        ]);
    },

    async _fetchStaticAlerts() {
        try {
            const res = await fetch('data/alerts.json');
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {
            console.warn('Could not fetch alerts.json, using fallback data:', e);
        }
        return {
            meta: { location: 'New Delhi, India', last_updated: new Date().toISOString() },
            active_alerts: [
                {
                    id: 'alert-001',
                    type: 'heatwave',
                    title: 'Severe Heatwave — Delhi NCR region',
                    description: 'Temperature above 42°C expected until Friday. High risk for elderly, children, and outdoor workers. Avoid going outside between 11am–5pm.',
                    severity: 'high',
                    location: 'Delhi NCR',
                    lat: 28.6139,
                    lng: 77.2090,
                    tags: ['Drink water hourly', 'Stay indoors 11am–5pm', 'Watch for heatstroke']
                },
                {
                    id: 'alert-002',
                    type: 'air_quality',
                    title: 'Poor Air Quality — AQI 168',
                    description: 'Unhealthy for sensitive groups. Wear a mask if going outside. Keep windows closed during afternoon hours.',
                    severity: 'moderate',
                    location: 'Delhi NCR',
                    lat: 28.6304,
                    lng: 77.2177,
                    tags: ['Wear N95 mask', 'Close windows 12–4pm']
                }
            ],
            weather: {
                temperature_c: 42,
                feels_like_c: 47,
                humidity_percent: 28,
                aqi: 168,
                wind_kmh: 12,
                uv_index: 11,
                condition: 'Severe Heatwave',
                sunrise: '05:44',
                sunset: '19:12'
            },
            community_reports: [
                {
                    id: 'rep-001',
                    type: 'flood',
                    title: 'Waterlogging — Minto Road underpass',
                    location: 'Central Delhi',
                    lat: 28.6358,
                    lng: 77.2245,
                    reported_at: '2026-05-16T08:35:00+05:30',
                    severity: 'high',
                    status: 'confirmed',
                    verified: true
                },
                {
                    id: 'rep-002',
                    type: 'other',
                    title: 'Power outage — Sector 15 Rohini',
                    location: 'North Delhi',
                    lat: 28.7158,
                    lng: 77.1183,
                    reported_at: '2026-05-16T08:00:00+05:30',
                    severity: 'moderate',
                    status: 'verifying',
                    verified: false
                },
                {
                    id: 'rep-003',
                    type: 'other',
                    title: 'Tree fallen on road — Golf Links',
                    location: 'South Delhi',
                    lat: 28.5879,
                    lng: 77.2294,
                    reported_at: '2026-05-16T06:00:00+05:30',
                    severity: 'low',
                    status: 'resolved',
                    verified: true
                }
            ]
        };
    },

    async fetchLiveWeather() {
        const lat = localStorage.getItem('deshsafe_lat');
        const lng = localStorage.getItem('deshsafe_lng');
        if (!lat || !lng) return null;
        const apiBase = window.DeshSafeConfig?.API_BASE_URL || 'http://localhost:3001';
        try {
            const res = await this._withTimeout(fetch(`${apiBase}/api/weather/current?lat=${lat}&lng=${lng}`), 4000);
            if (!res.ok) return null;
            const data = await res.json();
            const w = data.weather;
            const result = {
                temperature_c: Math.round(w.tempC),
                feels_like_c: Math.round(w.feelsLikeC),
                humidity_percent: w.humidity,
                wind_kmh: Math.round((w.windSpeedMs || 0) * 3.6),
                condition: w.description ? w.description.replace(/\b\w/g, c => c.toUpperCase()) : w.condition,
                severeConditionDetected: data.severeConditionDetected,
                severity: data.severity
            };
            if (w.sunrise) result.sunrise = w.sunrise;
            if (w.airQuality) {
                result.aqi = w.airQuality.aqiIndex;
                result.aqi_label = w.airQuality.aqiLabel;
            }
            if (typeof w.uvIndex === 'number') result.uv_index = w.uvIndex;
            return result;
        } catch (e) {
            console.warn('Could not fetch live weather:', e);
            return null;
        }
    },

    syncUIWithProfile(profile) {
        const initials = getInitials(profile.name);

        document.querySelectorAll('.nav-avatar, .avatar-ring').forEach(avatar => {
            avatar.textContent = initials;
        });

        // FIX: auto-detected location takes priority over profile location
        const locationStr = localStorage.getItem('deshsafe_location') || profile.location || 'India';
        document.querySelectorAll('.nav-location').forEach(navLoc => {
            navLoc.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${locationStr}`;
        });

        const identityName = document.querySelector('.identity-name');
        if (identityName) {
            identityName.textContent = profile.name || 'Anonymous';
        }

        const greetingTitle = document.querySelector('.greeting-title');
        if (greetingTitle) {
            const hr = new Date().getHours();
            let timeOfDay = 'day';
            if (hr < 12) timeOfDay = 'morning';
            else if (hr < 17) timeOfDay = 'afternoon';
            else timeOfDay = 'evening';
            const firstName = profile.name ? profile.name.trim().split(/\s+/)[0] : 'Anonymous';
            greetingTitle.innerHTML = `Good ${timeOfDay}, ${firstName} 👋`;
        }

        const profileCard = document.querySelector('.profile-card');
        if (profileCard) {
            const items = profileCard.querySelectorAll('.profile-item');
            if (items.length >= 4) {
                items[0].innerHTML = `<i class="fa-solid fa-user"></i> <span>${profile.name || 'Anonymous'}, Age ${profile.age || '—'}</span>`;
                const healthStr = profile.healthTags && profile.healthTags.length > 0 ? profile.healthTags.join(', ') : 'No conditions';
                items[1].innerHTML = `<i class="fa-solid fa-lungs"></i> <span>${healthStr} condition</span>`;
                const familyText = typeof profile.familySize === 'string' && profile.familySize.includes('member') 
                    ? profile.familySize 
                    : `Family of ${profile.familySize || '—'} members`;
                items[2].innerHTML = `<i class="fa-solid fa-people-roof"></i> <span>${familyText}</span>`;
                items[3].innerHTML = `<i class="fa-solid fa-location-dot"></i> <span>${locationStr}</span>`;
            }

            const stepsSub = document.querySelector('.steps-sub');
            if (stepsSub) {
                const healthPart = profile.healthTags && profile.healthTags.length > 0 ? `, ${profile.healthTags.join(', ')} condition` : '';
                const familyText = typeof profile.familySize === 'string' && profile.familySize.includes('member') 
                    ? profile.familySize 
                    : `Family of ${profile.familySize || '—'}`;
                stepsSub.textContent = `Based on your profile — Age ${profile.age || '—'}${healthPart}, ${familyText}`;
            }
        }

        const safetyCard = document.querySelector('.safety-card');
        if (safetyCard) {
            const safetyItems = safetyCard.querySelectorAll('.safety-item');
            if (safetyItems.length > 0) {
                const hasAsthma = profile.healthTags?.some(t => t.toLowerCase().includes('asthma'));
                safetyItems[0].innerHTML = hasAsthma 
                    ? `<span class="safety-dot dot-red"></span><p>Heat risk — HIGH for asthma patients</p>`
                    : `<span class="safety-dot dot-amber"></span><p>Heat risk — Moderate for general public</p>`;
            }
        }
    },

    async syncUI() {
        const profile = await this.getProfile();
        this.syncUIWithProfile(profile);
    },

    async initializeDashboard() {
        const profile = await this.getProfile();
        const data = await this.fetchAlertsAndWeather();
        const liveWeather = await this.fetchLiveWeather();
        const weather = liveWeather ? { ...data.weather, ...liveWeather } : data.weather;

        // FIX: update alert count in greeting dynamically
        const alertCountEl = document.getElementById('alert-count');
        if (alertCountEl && data.active_alerts) {
            alertCountEl.textContent = data.active_alerts.length;
        }

        if (weather) {
            if (typeof animateCounter === 'function') {
                animateCounter('stat-temp', weather.temperature_c || 42, '°C');
                animateCounter('stat-aqi', weather.aqi || 168, '');
                animateCounter('stat-humidity', weather.humidity_percent || 28, '%');
            }

            const weatherCard = document.querySelector('.weather-card');
            if (weatherCard) {
                const locEl = weatherCard.querySelector('.weather-location');
                const tempEl = weatherCard.querySelector('.weather-temp');
                const descEl = weatherCard.querySelector('.weather-desc');
                const statVals = weatherCard.querySelectorAll('.weather-stat-val');

                const displayLocation = localStorage.getItem('deshsafe_location') || profile.location || data.meta.location || 'New Delhi, India';
                if (locEl) locEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${displayLocation}`;
                if (tempEl) tempEl.textContent = `${weather.temperature_c}°C`;
                if (descEl) descEl.textContent = `${weather.condition} · Feels like ${weather.feels_like_c}°C`;

                if (statVals.length >= 3) {
                    statVals[0].textContent = `${weather.wind_kmh} km/h`;
                    statVals[1].textContent = `${weather.uv_index}`;
                    statVals[2].textContent = `${weather.sunrise}am`;
                }
            }
        }

        const alertsSection = document.querySelector('.alerts-section');
        if (alertsSection) {
            const header = alertsSection.querySelector('.section-header');
            alertsSection.innerHTML = '';
            if (header) alertsSection.appendChild(header);

            const activeAlerts = data.active_alerts || [];
            if (activeAlerts.length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.style.cssText = 'padding: 20px; color: var(--text-muted); text-align: center; font-style: italic;';
                emptyMsg.textContent = 'No active alerts in your area.';
                alertsSection.appendChild(emptyMsg);
            } else {
                activeAlerts.forEach(alert => {
                    const cardHTML = renderAlertCard(alert);
                    const wrapper = document.createElement('div');
                    wrapper.innerHTML = cardHTML.trim();
                    alertsSection.appendChild(wrapper.firstChild);
                });
            }
        }

        const historyCard = document.querySelector('.history-card');
        if (historyCard) {
            const header = historyCard.querySelector('.section-header');
            historyCard.innerHTML = '';
            if (header) historyCard.appendChild(header);

            const communityReports = data.community_reports || [];
            const userReports = await this.getReports();
            const localReports = typeof getStoredReports === 'function' ? getStoredReports() : [];

            const formattedUserReports = [...userReports, ...localReports].map(rep => ({
                id: rep.id,
                type: rep.type.toLowerCase(),
                title: rep.title,
                location: rep.location,
                reported_at: rep.submittedAt || new Date().toISOString(),
                severity: rep.severity,
                status: 'submitted',
                verified: false,
                isUserReport: true
            }));

            const allReports = [...formattedUserReports, ...communityReports];
            allReports.sort((a, b) => new Date(b.reported_at) - new Date(a.reported_at));

            if (allReports.length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.style.cssText = 'padding: 15px 0; color: var(--text-muted); text-align: center; font-style: italic; font-size: 13px;';
                emptyMsg.textContent = 'No recent incident reports.';
                historyCard.appendChild(emptyMsg);
            } else {
                allReports.forEach(report => {
                    const itemHTML = renderHistoryItem(report);
                    const wrapper = document.createElement('div');
                    wrapper.innerHTML = itemHTML.trim();
                    historyCard.appendChild(wrapper.firstChild);
                });
            }
        }
    }
};

// ── Dynamic Render Helpers ──
function renderAlertCard(alert) {
    const iconMap = {
        heatwave: 'fa-temperature-high',
        air_quality: 'fa-wind',
        flood: 'fa-cloud-showers-heavy',
        earthquake: 'fa-house-crack'
    };
    const icon = iconMap[alert.type] || 'fa-triangle-exclamation';

    let cardClass = 'alert-warning';
    let badgeClass = 'level-moderate';
    if (alert.severity === 'high') {
        cardClass = 'alert-danger';
        badgeClass = 'level-high';
    } else if (alert.severity === 'low') {
        cardClass = 'alert-info';
        badgeClass = 'level-low';
    }

    const tagsHTML = (alert.tags || []).map(tag => `<span class="tag ${alert.severity === 'moderate' ? 'tag-warning' : ''}">${tag}</span>`).join('');

    return `
        <div class="alert-card ${cardClass}">
            <div class="alert-top">
                <div class="alert-type">
                    <i class="fa-solid ${icon}"></i>
                    ${alert.type.replace('_', ' ').toUpperCase()} Alert
                </div>
                <span class="alert-level ${badgeClass}">${alert.severity.toUpperCase()}</span>
            </div>
            <div class="alert-body">
                <h3 class="alert-title">${alert.title}</h3>
                <p class="alert-desc">${alert.description}</p>
                <div class="alert-tags">
                    ${tagsHTML}
                </div>
                <a href="${alert.action_plan_url || 'action.html'}" class="alert-action-btn">View My Action Plan →</a>
            </div>
        </div>
    `;
}

function renderHistoryItem(report) {
    const iconMap = {
        heatwave: 'fa-temperature-high',
        air_quality: 'fa-wind',
        flood: 'fa-cloud-rain',
        earthquake: 'fa-house-crack'
    };
    const icon = iconMap[report.type] || 'fa-triangle-exclamation';

    let iconColorClass = 'icon-blue';
    if (report.severity === 'high' || report.severity === 'danger') {
        iconColorClass = 'icon-red';
    } else if (report.severity === 'moderate' || report.severity === 'medium' || report.severity === 'warning') {
        iconColorClass = 'icon-amber';
    }

    let badgeClass = 'badge-amber';
    let statusText = report.status || 'Active';
    if (statusText === 'resolved') { badgeClass = 'badge-blue'; statusText = 'Resolved'; }
    else if (statusText === 'confirmed') { badgeClass = 'badge-red'; statusText = 'Confirmed'; }
    else if (statusText === 'submitted') { badgeClass = 'badge-red'; statusText = 'Submitted'; }
    else if (statusText === 'verifying') { badgeClass = 'badge-amber'; statusText = 'Verifying'; }

    const typeLabel = report.type.replace('_', ' ');
    const timeFormatted = formatReportTime(report.reported_at);

    return `
        <div class="history-item">
            <div class="history-icon ${iconColorClass}"><i class="fa-solid ${icon}"></i></div>
            <div class="history-info">
                <p class="history-name">${report.title} (${typeLabel})</p>
                <p class="history-time">${timeFormatted} · ${report.location}</p>
            </div>
            <span class="history-badge ${badgeClass}">${statusText}</span>
        </div>
    `;
}

function formatReportTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    if (isNaN(date.getTime())) return dateStr;
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    else if (diffHours < 24) {
        const isSameDay = date.getDate() === now.getDate();
        if (isSameDay) return `Today, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    }
    const isYesterday = new Date(now - 86400000).getDate() === date.getDate();
    if (isYesterday) return `Yesterday, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) + `, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

// ══════════════════════════════════════════
//  PWA: SERVICE WORKER & INDEXEDDB SYNC
// ══════════════════════════════════════════

const DB_NAME = 'deshsafe-db';
const STORE_NAME = 'reports-queue';

window.DeshSafeSyncQueue = {
    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    },

    async queueReport(report, apiBase, authToken) {
        const db = await this.openDB();
        const item = {
            id: report.id || 'report-' + Date.now(),
            report,
            apiBase,
            authToken,
            timestamp: Date.now()
        };
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(item);
            request.onsuccess = () => {
                console.log('[Sync Queue] Report queued successfully in IndexedDB:', item.id);
                resolve();
            };
            request.onerror = (event) => reject(event.target.error);
        });
    },

    async getQueuedReports() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    },

    async removeQueuedReport(id) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    },

    async syncQueue() {
        if (!navigator.onLine) return;
        try {
            const reports = await this.getQueuedReports();
            if (!reports || reports.length === 0) return;

            console.log(`[Sync Queue] Attempting to sync ${reports.length} queued reports...`);

            let token = null;
            if (window.DeshSafe.currentUser) {
                try {
                    token = await window.DeshSafe.currentUser.getIdToken();
                } catch (e) {
                    console.warn('[Sync Queue] Failed to get fresh auth token:', e);
                }
            }

            for (const item of reports) {
                const { report, apiBase } = item;
                const useToken = token || item.authToken;

                const typeMapping = {
                    'heatwave': 'heatwave',
                    'flood': 'flood',
                    'fire': 'fire',
                    'storm / cyclone': 'cyclone',
                    'building collapse': 'other',
                    'other crisis': 'other'
                };
                const mappedType = typeMapping[(report.type || '').toLowerCase()] || 'other';

                const payload = {
                    type: mappedType,
                    severity: report.severity || 'medium',
                    description: `${report.title || 'No Title'}\n\n${report.description || ''}`.trim(),
                    location: {
                        lat: report.lat || 0,
                        lng: report.lng || 0,
                        address: report.location || 'Unknown',
                        district: report.district || null,
                        state: report.state || null
                    },
                    photoUrl: report.photo || null
                };

                const headers = {
                    'Content-Type': 'application/json'
                };
                if (useToken) {
                    headers['Authorization'] = `Bearer ${useToken}`;
                }

                try {
                    const res = await fetch(`${apiBase}/api/reports`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload)
                    });

                    if (res.status === 201 || res.status === 200) {
                        console.log(`[Sync Queue] Successfully synced report: ${item.id}`);
                        await this.removeQueuedReport(item.id);
                    } else if (res.status === 401 || res.status === 403) {
                        console.warn(`[Sync Queue] Authentication error for report: ${item.id}. Will retry when session refreshes.`);
                    } else {
                        console.warn(`[Sync Queue] Failed to sync report (status ${res.status}): ${item.id}`);
                    }
                } catch (err) {
                    console.error(`[Sync Queue] Network error while syncing report: ${item.id}`, err);
                    break;
                }
            }
        } catch (err) {
            console.error('[Sync Queue] Error in syncQueue:', err);
        }
    }
};

function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    if (navigator.onLine) {
        banner.style.display = 'none';
        window.DeshSafeSyncQueue.syncQueue();
    } else {
        banner.style.display = 'flex';
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Global initialization logic on page load
document.addEventListener('DOMContentLoaded', async () => {
    detectAndSetLocation();
    updateOnlineStatus();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('[DeshSafe] Service Worker registered scope:', reg.scope);
                if (navigator.onLine) {
                    window.DeshSafeSyncQueue.syncQueue();
                }
            })
            .catch(err => {
                console.error('[DeshSafe] Service Worker registration failed:', err);
            });
    }

    try {
        const { onAuthChange, logOut } = await import('./firebase.js');

        onAuthChange(async (user) => {
            window.DeshSafe.currentUser = user || null;

            const protectedPages = ['dashboard.html', 'report.html', 'profile.html', 'action.html'];
            const currentPage = window.location.pathname.split('/').pop();
            if (!user && protectedPages.includes(currentPage)) {
                window.location.href = 'auth.html';
                return;
            }

            await window.DeshSafe.syncUI();
            _updateNavAuthButton(user, logOut);

            if (document.getElementById('stat-temp') || document.querySelector('.alerts-section')) {
                await window.DeshSafe.initializeDashboard();
            }
        });
    } catch (e) {
        console.warn('Firebase not configured. Running in offline/preview mode.', e);
        await window.DeshSafe.syncUI();
        if (document.getElementById('stat-temp') || document.querySelector('.alerts-section')) {
            await window.DeshSafe.initializeDashboard();
        }
    }
});

// ── Navbar auth button helper ──
function _updateNavAuthButton(user, logOut) {
    const authBtn = document.getElementById('nav-auth-btn');
    if (!authBtn) return;

    if (user) {
        authBtn.textContent = 'Sign Out';
        authBtn.href = '#';
        authBtn.onclick = async (e) => {
            e.preventDefault();
            await logOut();
            window.location.href = 'auth.html';
        };
    } else {
        authBtn.textContent = 'Sign In';
        authBtn.href = 'auth.html';
        authBtn.onclick = null;
    }
}