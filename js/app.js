window.isMobile = window.innerWidth <= 768 || L.Browser.mobile;

// --- GLOBAL STORES ---
window.stationsData = {};
window.routesData = [];
window.timetablesData = {};
window.notesDict = {};
window.lineColorsDict = {};
window.lineEndpoints = {};
window.transferLogicData = {};

window.getContrastColor = function(hexColor) {
    if (!hexColor) return '#ffffff';
    hexColor = hexColor.replace("#", "");
    if (hexColor.length === 3) hexColor = hexColor[0] + hexColor[0] + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2];
    if (hexColor.length !== 6) return '#ffffff';
    const r = parseInt(hexColor.slice(0, 2), 16), g = parseInt(hexColor.slice(2, 4), 16), b = parseInt(hexColor.slice(4, 6), 16);
    return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 140) ? '#1a1a1a' : '#ffffff';
};

window.timeToMins = function(timeStr) {
    if (!timeStr) return 99999;
    let match = timeStr.toString().match(/\d{1,2}[\.,:]\d{2}/);
    if (!match) return 99999;
    let parts = match[0].replace(':', '.').replace(',', '.').split('.');
    let m = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    return m < 180 ? m + 1440 : m; 
};

// --- DATA INITIALIZATION ---
async function loadMapData() {
    try {
        // FIXED: Corrected the typo to 'transfer_logic.json'
        const [stationsRes, routesRes, ttRes, notesRes, transferLogicRes] = await Promise.all([
            fetch('stations.json'), 
            fetch('routes.json'), 
            fetch('timetables_master.json'), 
            fetch('notes_dict.json'),
            fetch('transfer_logic.json') 
        ]);
        
        window.stationsData = await stationsRes.json();
        window.routesData = await routesRes.json();
        window.timetablesData = await ttRes.json();
        window.notesDict = await notesRes.json();
        window.transferLogicData = await transferLogicRes.json();
        
        if (typeof window.initializeMap === "function") {
            window.initializeMap();
        }
    } catch (error) {
        console.error("Chyba:", error);
        alert("Nepodařilo se načíst data. Běžíte na lokálním serveru?");
    }
}

// Wait for the HTML to fully load before fetching data and drawing the map
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMapData);
} else {
    loadMapData();
}
