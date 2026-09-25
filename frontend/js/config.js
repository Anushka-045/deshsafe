// DeshSafe Frontend Runtime Configuration
window.DeshSafeConfig = {
    // Production Render Backend API URL
    API_BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3001' 
        : 'https://deshsafe-api.onrender.com',
    
    // Optional Google Maps API key (defaults to free OpenStreetMap if empty)
    GOOGLE_MAPS_API_KEY: ''
};
