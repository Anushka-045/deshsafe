// Update the greeting date dynamically
document.addEventListener("DOMContentLoaded", () => {
  fetch("data/alerts.json")
    .then(response => response.json())
    .then(data => {
      // Update greeting with alerts count
      updateDate(data.activeAlerts.length);

      // Update counters dynamically
      populateCounters(data.statistics);

      // Update weather dynamically
      populateWeather(data.weather);

      // Update community reports (if you have a section for it)
      populateReports(data.communityReports);
    })
    .catch(error => console.error("Error loading alerts.json:", error));
});

function updateDate(alertCount) {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateString = now.toLocaleDateString('en-IN', options);
  document.getElementById('greeting-date').innerHTML =
    `${dateString} · Stay safe today — ${alertCount} active alerts in your area`;
}

// Counters
function populateCounters(stats) {
  animateCounter('stat-temp', stats.temp, '°C');
  animateCounter('stat-aqi', stats.aqi, '');
  animateCounter('stat-humidity', stats.humidity, '%');
}

// Weather
function populateWeather(weather) {
  const element = document.getElementById("weather-info");
  if (element) {
    element.innerHTML = `Temperature: ${weather.temp}°C, Condition: ${weather.condition}`;
  }
}

// Reports
function populateReports(reports) {
  const container = document.getElementById("reports");
  if (!container) return;
  container.innerHTML = "";
  reports.forEach(r => {
    const li = document.createElement("li");
    li.textContent = `${r.user}: ${r.comment}`;
    container.appendChild(li);
  });
}

// Animate counters
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
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card').forEach(function(card) {
  observer.observe(card);
});

// Steps progress
const steps = document.querySelectorAll('.step-item');
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
    updateProgress();
  });
});
