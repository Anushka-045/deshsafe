// ═══════════════════════════════════════════
//  DeshSafe — action.js (Dynamic AI/Health-Aware Emergency Action Plan)
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    const profile = await window.DeshSafe.getProfile();
    const activeAlertsData = await window.DeshSafe.fetchAlertsAndWeather();
    
    // Determine active alert / disaster type
    const activeAlert = (activeAlertsData.active_alerts && activeAlertsData.active_alerts[0]) || {
        type: 'heatwave',
        title: 'Severe Heatwave Alert',
        severity: 'high',
        location: profile.location || 'Your Area'
    };

    renderActionHeader(activeAlert, profile);
    const steps = generatePersonalizedSteps(activeAlert.type, profile);
    renderActionSteps(steps);
    renderProfileSummary(profile);
});

function renderActionHeader(alert, profile) {
    const titleEl = document.querySelector('.context-title');
    const locEl = document.querySelector('.context-location');
    const subEl = document.querySelector('.steps-sub');

    const typeIcons = {
        heatwave: '🌡️',
        flood: '🌊',
        fire: '🔥',
        cyclone: '🌀',
        air_quality: '😷',
        earthquake: '🏚️'
    };

    if (titleEl) {
        titleEl.textContent = `${typeIcons[alert.type] || '⚠️'} ${alert.title || 'Emergency Advisory'}`;
    }
    if (locEl) {
        locEl.textContent = `📍 ${alert.location || profile.location || 'India'}`;
    }
    if (subEl) {
        const healthStr = (profile.healthTags && profile.healthTags.length > 0) ? profile.healthTags.join(', ') : 'General Public';
        subEl.textContent = `Tailored for ${profile.name || 'User'} (Age ${profile.age || 'N/A'}, Health: ${healthStr}, ${profile.familySize || 'Family'})`;
    }
}

function generatePersonalizedSteps(disasterType, profile) {
    const health = (profile.healthTags || []).map(h => h.toLowerCase());
    const hasAsthma = health.some(h => h.includes('asthma') || h.includes('lung') || h.includes('respiratory'));
    const hasElderly = health.some(h => h.includes('elderly') || h.includes('senior') || (profile.age && parseInt(profile.age) > 60));
    const hasCardiac = health.some(h => h.includes('heart') || h.includes('cardiac') || h.includes('bp'));
    const hasInfants = health.some(h => h.includes('infant') || h.includes('child') || h.includes('baby'));

    let steps = [];

    if (disasterType === 'heatwave') {
        steps.push({
            title: 'Immediate ORS / Electrolyte Hydration',
            desc: hasAsthma 
                ? 'Drink 500ml ORS / electrolyte solution now. Dehydration rapidly accelerates breathing difficulty and triggers severe asthma attacks in heat.'
                : 'Drink 500ml water or ORS solution immediately to prevent heat exhaustion.'
        });
        steps.push({
            title: 'Thermal & Sun Protection',
            desc: hasElderly || hasCardiac
                ? 'Remain indoors in cooled area between 11 AM – 5 PM. High ambient temperatures put severe pressure on cardiac rhythm.'
                : 'Stay indoors during peak sunlight (11 AM - 5 PM). Cover head with wet cloth if going out.'
        });
        steps.push({
            title: hasAsthma ? 'Prepare Emergency Inhaler & Nebulizer' : 'Cooling Packs & Cold Compress',
            desc: hasAsthma
                ? 'Keep rescue inhaler (Salbutamol/Ventolin) within arm reach. Avoid dusty fan drafts that circulate hot allergens.'
                : 'Apply cold damp towels on neck, armpits, and wrists to bring down core body temperature.'
        });
        steps.push({
            title: 'Check on Family & Vulnerable Members',
            desc: `Verify safety for all ${profile.familySize || 'family members'}. Ensure infants and elderly have wet cloths and hydration.`
        });
    } else if (disasterType === 'flood') {
        steps.push({
            title: 'Evacuate to Higher Ground / Safe Shelter',
            desc: 'Move to 2nd floor or higher immediately. Check live shelter route on the DeshSafe map.'
        });
        steps.push({
            title: 'Pack Medical Waterproof Emergency Kit',
            desc: hasAsthma || hasCardiac
                ? 'Seal inhalers, cardiac medications, prescription copies, and power bank in ziplock waterproof bags.'
                : 'Pack essential medications, clean water, flashlight, and documents in waterproof bag.'
        });
        steps.push({
            title: 'Disconnect Main Power & Gas Supplies',
            desc: 'Turn off main electrical breaker and LPG gas valves to prevent electrocution or gas leaks.'
        });
        steps.push({
            title: 'Avoid Wading in Flood Waters',
            desc: 'Flood waters harbor sewage pathogens and hidden electrical hazards. Do not walk or drive through flowing water.'
        });
    } else {
        // Generic Emergency Response
        steps.push({
            title: 'Alert Family & Emergency Contacts',
            desc: 'Send current coordinates to saved emergency contacts via DeshSafe SOS button.'
        });
        steps.push({
            title: 'Secure Essential Emergency Supplies',
            desc: 'Gather water, non-perishable food, flashlight, first-aid kit, and personal medication.'
        });
        steps.push({
            title: 'Monitor Live Official Government Bulletins',
            desc: 'Keep checking NDMA / IMD live updates on your DeshSafe dashboard feed.'
        });
    }

    return steps;
}

function renderActionSteps(steps) {
    const listEl = document.querySelector('.steps-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    const STORAGE_KEY = 'completedSteps';
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    steps.forEach((step, index) => {
        const item = document.createElement('div');
        item.className = 'step-item' + (saved.includes(index) ? ' completed' : '');
        item.innerHTML = `
            <div class="step-number">${index + 1}</div>
            <div class="step-content">
                <h3 class="step-title">${step.title}</h3>
                <p class="step-desc">${step.desc}</p>
            </div>
            <div class="step-check"><i class="fa-solid fa-check"></i></div>
        `;

        item.addEventListener('click', () => {
            item.classList.toggle('completed');
            const currentCompleted = [];
            document.querySelectorAll('.step-item').forEach((el, idx) => {
                if (el.classList.contains('completed')) currentCompleted.push(idx);
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentCompleted));
            updateProgress();
        });

        listEl.appendChild(item);
    });

    updateProgress();
}

function updateProgress() {
    const total = document.querySelectorAll('.step-item').length;
    const completed = document.querySelectorAll('.step-item.completed').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('progress-percent');
    
    if (fill) fill.style.width = percent + '%';
    if (label) label.textContent = percent + '%';
}

function renderProfileSummary(profile) {
    const items = document.querySelectorAll('.profile-card .profile-item');
    if (items.length >= 4) {
        items[0].innerHTML = `<i class="fa-solid fa-user"></i> <span>${profile.name || 'User'}, Age ${profile.age || '—'}</span>`;
        const healthStr = (profile.healthTags && profile.healthTags.length > 0) ? profile.healthTags.join(', ') : 'No conditions';
        items[1].innerHTML = `<i class="fa-solid fa-lungs"></i> <span>${healthStr} condition</span>`;
        items[2].innerHTML = `<i class="fa-solid fa-people-roof"></i> <span>Family of ${profile.familySize || '4'}</span>`;
        items[3].innerHTML = `<i class="fa-solid fa-location-dot"></i> <span>${profile.location || 'India'}</span>`;
    }
}
