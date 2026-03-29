// --- GLOBAL VARIABLES ---
window.isMobile = window.innerWidth <= 768 || L.Browser.mobile;
window.stationsData = {};
window.routesData = [];
window.timetablesData = {};
window.notesDict = {};
window.lineColorsDict = {};

// --- HELPERS ---
function getContrastColor(hexColor) {
    if (!hexColor) return '#ffffff';
    hexColor = hexColor.replace("#", "");
    if (hexColor.length === 3) hexColor = hexColor[0] + hexColor[0] + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2];
    if (hexColor.length !== 6) return '#ffffff';
    const r = parseInt(hexColor.slice(0, 2), 16), g = parseInt(hexColor.slice(2, 4), 16), b = parseInt(hexColor.slice(4, 6), 16);
    return (((r * 299) + (g * 587) + (b * 114)) / 1000 >= 140) ? '#1a1a1a' : '#ffffff';
}

function timeToMins(timeStr) {
    if (!timeStr) return 99999;
    let match = timeStr.toString().match(/\d{1,2}[\.,:]\d{2}/);
    if (!match) return 99999;
    let parts = match[0].replace(':', '.').replace(',', '.').split('.');
    let m = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    return m < 180 ? m + 1440 : m; // Handles midnight crossovers
}

function getBadgeForTrainAtStation(trainId, stationName) {
    for (let r of window.routesData) {
        if (r.trainNames && r.trainNames.includes(trainId) && r.waypoints.includes(stationName)) {
            if (r.changeAt && r.changesTo) {
                let idx = r.waypoints.indexOf(stationName);
                let changeIdx = r.waypoints.indexOf(r.changeAt);
                if (idx >= changeIdx) return { line: r.changesTo, color: r.changeColor || window.lineColorsDict[r.changesTo] || '#94a3b8' };
                else return { line: r.lineName, color: r.color || window.lineColorsDict[r.lineName] || '#94a3b8' };
            }
            return { line: r.lineName, color: r.color || window.lineColorsDict[r.lineName] || '#94a3b8' };
        }
    }
    return null;
}

// --- INITIALIZER ---
async function loadMapData() {
    try {
        const [stationsRes, routesRes, ttRes, notesRes] = await Promise.all([
            fetch('stations.json'), fetch('routes.json'), fetch('timetables_master.json'), fetch('notes_dict.json')
        ]);
        window.stationsData = await stationsRes.json();
        window.routesData = await routesRes.json();
        window.timetablesData = await ttRes.json();
        window.notesDict = await notesRes.json();
        
        if (typeof initializeMap === "function") {
            initializeMap(); // Calls the function in map.js
        }
    } catch (error) {
        console.error("Chyba:", error);
        alert("Nepodařilo se načíst data. Ujistěte se, že běžíte lokální server.");
    }
}

// Boot the app
loadMapData();