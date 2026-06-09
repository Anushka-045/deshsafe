// DeshSafe — report.js
let selectedType = 'Heatwave';
let selectedSeverity = 'medium';
let photoBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
    const timeInput = document.getElementById('incident-time');
    if (timeInput) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeInput.value = `${hours}:${minutes}`;
    }
});

function openSOS() {
    const overlay = document.getElementById('sos-overlay');
    if (overlay) overlay.classList.add('open');
}

function closeSOS(event) {
    const overlay = document.getElementById('sos-overlay');
    if (overlay) {
        if (event && event.target !== overlay) return;
        overlay.classList.remove('open');
    }
}

function selectType(element) {
    document.querySelectorAll('.type-card').forEach(card => card.classList.remove('selected'));
    element.classList.add('selected');
    const nameEl = element.querySelector('.type-name');
    if (nameEl) selectedType = nameEl.textContent.trim();
}

function selectSeverity(level, element) {
    document.querySelectorAll('.severity-btn').forEach(btn => btn.classList.remove('selected'));
    element.classList.add('selected');
    selectedSeverity = level;
}

function previewPhoto(event) {
    const input = event.target;
    const previewWrap = document.getElementById('preview-wrap');
    const previewImg = document.getElementById('preview-img');

    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            photoBase64 = e.target.result;
            if (previewImg) previewImg.src = photoBase64;
            if (previewWrap) previewWrap.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function detectLocation() {
    const status = document.getElementById('gps-status');
    const locationInput = document.getElementById('incident-location');

    if (!navigator.geolocation) {
        status.textContent = 'Geolocation is not supported by your browser.';
        return;
    }

    status.textContent = 'Detecting your location...';

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
                );
                const data = await res.json();
                const address = data.display_name || `${latitude}, ${longitude}`;
                locationInput.value = address;
                status.textContent = '✅ Location detected.';
            } catch {
                locationInput.value = `${latitude}, ${longitude}`;
                status.textContent = '✅ Coordinates captured (reverse geocode failed).';
            }
        },
        (err) => {
            status.textContent = `❌ Could not get location: ${err.message}`;
        }
    );
}

function submitReport() {
    const title = document.getElementById('incident-title')?.value.trim();
    const desc = document.getElementById('incident-desc')?.value.trim();
    const location = document.getElementById('incident-location')?.value.trim();
    const time = document.getElementById('incident-time')?.value;

    const error = document.getElementById('form-error');

    const requiredFields = [
        document.getElementById('incident-title'),
        document.getElementById('incident-desc'),
        document.getElementById('incident-location'),
        document.getElementById('incident-time')
    ];

    requiredFields.forEach(field => {
        if (field) {
            field.style.borderColor = '';
        }
    });

    let hasError = false;

    requiredFields.forEach(field => {
    if (field && !field.value.trim()) {
        field.style.borderColor = 'var(--red)';
        hasError = true;
    }
    });

    if (hasError) {
        error.style.display = 'block';
        return;
    }

    error.style.display = 'none';

    const randomId = 'DS-' + Math.floor(1000 + Math.random() * 9000);

    const report = {
        id: randomId,
        type: selectedType,
        severity: selectedSeverity,
        title,
        description: desc,
        location,
        time,
        photo: photoBase64 || null,
        submittedAt: new Date().toISOString()
    };

    // Save to localStorage
    try {
        const existing = JSON.parse(localStorage.getItem('deshsafe_reports') || '[]');
        existing.push(report);
        localStorage.setItem('deshsafe_reports', JSON.stringify(existing));
    } catch (e) {
        console.error('localStorage save failed:', e);
    }

    // Update report ID display
    const reportIdEl = document.getElementById('report-id');
    if (reportIdEl) reportIdEl.textContent = `Report ID: #${randomId}`;

    // Hide form, show success
    const formContainer = document.getElementById('report-form');
    if (formContainer) formContainer.style.display = 'none';

    const successScreen = document.getElementById('success-screen');
    if (successScreen) successScreen.classList.add('show');
}