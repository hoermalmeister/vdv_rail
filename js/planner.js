window.plannerGraphEdges = {}; 
window.allStationsList = []; 

const DAYS_MAP = { 
    "Pondělí": 1, "Úterý": 2, "Středa": 3, "Čtvrtek": 4, 
    "Pátek": 5, "Sobota": 6, "Neděle": 7, 
    "Státní svátek": 0 
};

// --- POMOCNÁ FUNKCE PRO ODSTRANĚNÍ DIAKRITIKY ---
window.removeDiacritics = function(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// --- NAŠEPTÁVAČ ---
window.populateStationList = function() {
    if (window.allStationsList.length > 0) return;
    let stationSet = new Set();
    
    if (window.stationsData) Object.keys(window.stationsData).forEach(s => stationSet.add(s));
    
    for (let pdf in window.timetablesData) {
        let trains = window.timetablesData[pdf].trains;
        if (trains) {
            for (let tId in trains) {
                if (trains[tId].stops) {
                    trains[tId].stops.forEach(stop => {
                        if (stop.station) stationSet.add(stop.station);
                    });
                }
            }
        }
    }
    window.allStationsList = Array.from(stationSet).sort((a, b) => a.localeCompare(b, 'cs'));
};

window.handleInput = function(type) {
    window.populateStationList(); 

    const input = document.getElementById(`planner-${type}`);
    const box = document.getElementById(`suggestions-${type}`);
    if (!input || !box) return;

    const rawVal = input.value.toLowerCase().trim();
    const searchVal = window.removeDiacritics(rawVal);

    const otherType = type === 'from' ? 'to' : 'from';
    const otherBox = document.getElementById(`suggestions-${otherType}`);
    if (otherBox) otherBox.style.display = 'none';

    if (!searchVal) {
        box.style.display = 'none';
        return;
    }

    const matches = window.allStationsList.filter(s => 
        window.removeDiacritics(s.toLowerCase()).includes(searchVal)
    ).slice(0, 30);

    if (matches.length > 0) {
        box.innerHTML = matches.map(m => {
            let escaped = m.replace(/'/g, "\\'").replace(/"/g, "&quot;");
            return `<div class="suggestion-item" onmousedown="window.selectStation('${type}', '${escaped}')">${m}</div>`;
        }).join('');
        box.style.display = 'block';
    } else {
        box.innerHTML = `<div class="suggestion-item" style="color: #94a3b8; pointer-events: none;">Nenalezeno</div>`;
        box.style.display = 'block';
    }
};

window.selectStation = function(type, station) {
    document.getElementById(`planner-${type}`).value = station;
    document.getElementById(`suggestions-${type}`).style.display = 'none';
};

document.addEventListener('mousedown', function(e) {
    if (!e.target.closest('.planner-group')) {
        const fromBox = document.getElementById('suggestions-from');
        const toBox = document.getElementById('suggestions-to');
        if (fromBox) fromBox.style.display = 'none';
        if (toBox) toBox.style.display = 'none';
    }
});


// --- DETEKTIVNÍ DETEKCE LINEK DLE ÚSEKU ---
function getEdgeLineData(trainId, st1Name, st2Name, pdfName) {
    if (!window.routesData) return { name: "Vlak", color: "#94a3b8" };
    
    let matchingRoutes = window.routesData.filter(r => r.trainNames && r.trainNames.includes(trainId));
    
    if (matchingRoutes.length === 0) return { name: "Vlak", color: "#94a3b8" };
    if (matchingRoutes.length === 1) {
        let r = matchingRoutes[0];
        return { name: r.lineName, color: window.lineColorsDict?.[r.lineName] || r.color || "#94a3b8" };
    }

    // Vlak má více linek. Pokusíme se logicky odvodit, na které je zrovna teď.
    for (let r of matchingRoutes) {
        // 1. Zkusíme podle stanic (pokud vaše data obsahují seznam stanic pro danou linku)
        let pts = r.stations || r.stops || r.path || r.points || [];
        if (pts.length > 0 && pts.includes(st1Name) && pts.includes(st2Name)) {
            return { name: r.lineName, color: window.lineColorsDict?.[r.lineName] || r.color || "#94a3b8" };
        }
        
        // 2. Heuristika: Zkusíme podle názvu Jízdního řádu (Pokud se soubor jmenuje např. "S20.json")
        if (pdfName && typeof pdfName === 'string' && pdfName.toUpperCase().includes(r.lineName.toUpperCase())) {
            return { name: r.lineName, color: window.lineColorsDict?.[r.lineName] || r.color || "#94a3b8" };
        }
    }

    // Záloha: Pokud v datech chybí jakákoliv návaznost stanic na linky, vrátí první možnou linku.
    let fallback = matchingRoutes[0];
    return { name: fallback.lineName, color: window.lineColorsDict?.[fallback.lineName] || fallback.color || "#94a3b8" };
}

function buildPlannerGraph() {
    if (Object.keys(window.plannerGraphEdges).length > 0) return; 
    
    const WEEK_MINS = 7 * 1440;

    for (let pdf in window.timetablesData) {
        let trains = window.timetablesData[pdf].trains;
        if (!trains) continue;

        for (let tId in trains) {
            let t = trains[tId];
            if (!t.stops || t.stops.length < 2) continue;

            let originTimeStr = t.stops[0].departure || t.stops[0].time;
            let originMins = window.timeToMins(originTimeStr);
            if (originMins === 99999) continue;

            let opNotes = (t.notes || []).filter(n => window.transferLogicData[n]);
            let days = new Set();
            if (opNotes.length === 0) {
                [0, 1, 2, 3, 4, 5, 6, 7].forEach(d => days.add(d)); 
            } else {
                opNotes.forEach(n => {
                    (window.transferLogicData[n] || []).forEach(d => days.add(parseInt(d)));
                });
            }

            days.forEach(day => {
                let baseAbsOrigin_W0 = (day - 1) * 1440 + originMins;
                let baseAbsOrigin_W1 = baseAbsOrigin_W0 + WEEK_MINS;

                [baseAbsOrigin_W0, baseAbsOrigin_W1].forEach(baseOrigin => {
                    let currentAbsMins = baseOrigin;
                    let lastStopMins = originMins;

                    for (let i = 0; i < t.stops.length - 1; i++) {
                        let st1 = t.stops[i];
                        let st2 = t.stops[i+1];

                        let depStr = st1.departure || st1.time;
                        let arrStr = st2.arrival || st2.time || st2.departure;

                        if (!depStr || !arrStr) continue;

                        let depMins = window.timeToMins(depStr);
                        let arrMins = window.timeToMins(arrStr);

                        if (depMins < lastStopMins) depMins += 1440;
                        if (arrMins < depMins) arrMins += 1440;

                        let absDep = currentAbsMins + (depMins - lastStopMins);
                        let absArr = currentAbsMins + (arrMins - lastStopMins);

                        // PŘEDÁVÁME I NÁZEV PDF SOUBORU PRO LEPŠÍ DETEKCI
                        let lineData = getEdgeLineData(tId, st1.station, st2.station, pdf);

                        if (!window.plannerGraphEdges[st1.station]) window.plannerGraphEdges[st1.station] = [];
                        
                        window.plannerGraphEdges[st1.station].push({
                            to: st2.station,
                            absDep: absDep,
                            absArr: absArr,
                            trainId: tId,
                            lineName: lineData.name,
                            color: lineData.color,
                            depStr: depStr,
                            arrStr: arrStr
                        });

                        lastStopMins = arrMins;
                        currentAbsMins = absArr;
                    }
                });
            });
        }
    }
}

// --- ALGORITMUS (1 JÍZDA = 1 BLOK) ---
window.runPlannerSearch = function() {
    buildPlannerGraph();
    
    let from = document.getElementById('planner-from').value.trim();
    let to = document.getElementById('planner-to').value.trim();
    let dayStr = document.getElementById('planner-day').value;
    let timeStr = document.getElementById('planner-time').value;

    if (!from || !to) { alert("Zadejte nástupní a cílovou stanici."); return; }
    if (!window.plannerGraphEdges[from]) { alert(`Stanice "${from}" nebyla nalezena.`); return; }

    let dayNum = DAYS_MAP[dayStr] !== undefined ? DAYS_MAP[dayStr] : 1;
    let userMins = window.timeToMins(timeStr);
    if (userMins === 99999) userMins = 0;
    
    let userAbsTime = (dayNum - 1) * 1440 + userMins;

    let queue = [{ st: from, arrTime: userAbsTime, cost: 0, path: [], lastTrain: null }];
    let bestProfiles = { [from]: [{ cost: 0, arrTime: userAbsTime }] };
    let foundPath = null;
    let loops = 0;

    while (queue.length > 0 && loops < 150000) {
        queue.sort((a,b) => a.cost - b.cost); 
        let curr = queue.shift();
        loops++;

        if (curr.st === to) {
            foundPath = curr; 
            break; 
        }

        let edges = window.plannerGraphEdges[curr.st] || [];
        for (let edge of edges) {
            let isTransfer = curr.lastTrain && curr.lastTrain !== edge.trainId;
            let penaltyTime = isTransfer ? 5 : 0;
            let canBoardTime = curr.arrTime + penaltyTime;

            if (edge.absDep >= canBoardTime && edge.absDep <= canBoardTime + 720) {
                
                let travelTime = edge.absArr - edge.absDep;
                let waitTime = edge.absDep - curr.arrTime;
                
                let costPenalty = 0;
                if (curr.path.length === 0) {
                    costPenalty = (waitTime * 0.5) + travelTime;
                } else if (isTransfer) {
                    costPenalty = (waitTime * 1.5) + travelTime + 20;
                } else {
                    costPenalty = waitTime + travelTime;
                }

                let nextCost = curr.cost + costPenalty;
                
                let profiles = bestProfiles[edge.to] || [];
                let dominated = false;
                for (let p of profiles) {
                    if (p.cost <= nextCost && p.arrTime <= edge.absArr) {
                        dominated = true; break;
                    }
                }

                if (!dominated) {
                    bestProfiles[edge.to] = profiles.filter(p => !(nextCost <= p.cost && edge.absArr <= p.arrTime));
                    bestProfiles[edge.to].push({ cost: nextCost, arrTime: edge.absArr });

                    let newPath = curr.path.map(ride => ({ ...ride, lines: [...ride.lines] }));

                    if (isTransfer || newPath.length === 0) {
                        newPath.push({ 
                            trainId: edge.trainId, 
                            startSt: curr.st, 
                            endSt: edge.to, 
                            depStr: edge.depStr, 
                            arrStr: edge.arrStr,
                            lines: [{ name: edge.lineName, color: edge.color }] 
                        });
                    } else {
                        let currentRide = newPath[newPath.length - 1];
                        currentRide.endSt = edge.to;
                        currentRide.arrStr = edge.arrStr;
                        
                        let lastLine = currentRide.lines[currentRide.lines.length - 1];
                        if (lastLine.name !== edge.lineName) {
                            currentRide.lines.push({ name: edge.lineName, color: edge.color });
                        }
                    }

                    queue.push({
                        st: edge.to,
                        arrTime: edge.absArr,
                        cost: nextCost,
                        path: newPath,
                        lastTrain: edge.trainId
                    });
                }
            }
        }
    }

    renderPlannerResult(foundPath, from, to);
};

// --- ČISTÝ VYKRESLOVAČ ---
function renderPlannerResult(result, startSt, endSt) {
    const resultsContainer = document.getElementById('planner-results');
    const formContainer = document.getElementById('planner-form');
    
    if (!result || result.path.length === 0) {
        alert("Spojení nebylo nalezeno. Zkuste změnit čas nebo den.");
        return;
    }

    formContainer.style.display = 'none'; 
    
    let html = `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 12px;">
        <span style="font-weight: 700; color: #f8fafc; font-size: 14px;">${startSt} ➔ ${endSt}</span>
        <button onclick="document.getElementById('planner-form').style.display='block'; document.getElementById('planner-results').style.display='none';" style="background:none; border:none; color:#38bdf8; cursor:pointer; font-size:12px; font-weight: 600;">Změnit</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px; max-height: 300px; overflow-y: auto; padding-right: 4px;">`;

    result.path.forEach((ride, i) => {
        
        let linesHtml = ride.lines.map(l => {
            let textColor = window.getContrastColor ? window.getContrastColor(l.color) : '#fff';
            return `<span class="line-badge" style="background-color: ${l.color}; color: ${textColor}; font-size: 11px;">${l.name}</span>`;
        }).join('<span style="color: #94a3b8; font-size: 10px; margin: 0 4px;">➔</span>');

        html += `<div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 2px;">${linesHtml}</div>
                <span style="font-size: 11px; font-weight: 700; color: #38bdf8; cursor: pointer;" onclick="window.openSingleTrain('${ride.trainId}')">${ride.trainId}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #e2e8f0; margin-bottom: 4px;">
                <span>${ride.startSt}</span>
                <span style="font-family: monospace; font-weight: 600;">${ride.depStr}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8;">
                <span>➔ ${ride.endSt}</span>
                <span style="font-family: monospace;">${ride.arrStr}</span>
            </div>
        </div>`;
        
        if (i < result.path.length - 1) {
            html += `<div style="text-align: center; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">▼ Přestup ▼</div>`;
        }
    });

    html += `</div>`;
    resultsContainer.innerHTML = html;
    resultsContainer.style.display = 'block';
}
