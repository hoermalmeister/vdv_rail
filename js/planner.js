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


// --- DETEKCE LINEK DLE ÚSEKU (OPRAVA ZMĚNY ČÍSLA LINKY) ---
function getEdgeLineData(trainId, st1Name, st2Name) {
    if (!window.routesData) return { name: "Vlak", color: "#94a3b8" };
    
    // Nejprve hledá linku, která obsahuje daný vlak A ZÁROVEŇ tento konkrétní úsek (stanice)
    let matchedRoute = window.routesData.find(r => 
        r.trainNames && r.trainNames.includes(trainId) &&
        r.stations && r.stations.includes(st1Name) && r.stations.includes(st2Name)
    );
    
    // Záložní plán
    if (!matchedRoute) {
        matchedRoute = window.routesData.find(r => r.trainNames && r.trainNames.includes(trainId));
    }

    if (!matchedRoute) return { name: "Vlak", color: "#94a3b8" };
    return { name: matchedRoute.lineName, color: window.lineColorsDict[matchedRoute.lineName] || matchedRoute.color || "#94a3b8" };
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

                        let lineData = getEdgeLineData(tId, st1.station, st2.station);

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

// --- PARETO-DIJKSTRA ALGORITMUS (SPRÁVNÉ TRASOVÁNÍ) ---
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

    let queue = [{ st: from, arrTime: userAbsTime, cost: 0, path: [], lastTrain: null, lastLine: null }];
    
    // Pareto profily brání tomu, aby rychlý drahý spoj smazal levný pomalý spoj
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
                    // Čekání na startu je v pořádku (lepší jet později z domova)
                    costPenalty = (waitTime * 0.5) + travelTime;
                } else if (isTransfer) {
                    // Tvrdý přestup bolí a stát na nádraží je otravné
                    costPenalty = (waitTime * 1.5) + travelTime + 20;
                } else {
                    // OPRAVA BĚHU: Čekání uvnitř stejného vlaku je prostě jen normální čas cesty!
                    costPenalty = waitTime + travelTime;
                }

                let nextCost = curr.cost + costPenalty;
                
                // Kontrola Pareto dominance (zabrání zahození šikovných spojů)
                let profiles = bestProfiles[edge.to] || [];
                let dominated = false;
                for (let p of profiles) {
                    if (p.cost <= nextCost && p.arrTime <= edge.absArr) {
                        dominated = true;
                        break;
                    }
                }

                if (!dominated) {
                    bestProfiles[edge.to] = profiles.filter(p => !(nextCost <= p.cost && edge.absArr <= p.arrTime));
                    bestProfiles[edge.to].push({ cost: nextCost, arrTime: edge.absArr });

                    let newPath = [...curr.path];
                    let isLineChange = curr.lastLine && curr.lastLine !== edge.lineName;
                    
                    // Vizuální oddělení (Board leg) vzniká při fyzickém přestupu NEBO změně označení
                    let isNewLeg = isTransfer || isLineChange || curr.path.length === 0;

                    if (isNewLeg) {
                        newPath.push({ 
                            type: 'board', 
                            st: curr.st, 
                            train: edge.trainId, 
                            line: edge.lineName, 
                            color: edge.color, 
                            time: edge.depStr,
                            isRealTransfer: isTransfer // Důležité pro vykreslování "Zůstaňte ve vlaku"
                        });
                    }
                    
                    let alightLeg = { type: 'alight', st: edge.to, train: edge.trainId, line: edge.lineName, color: edge.color, time: edge.arrStr };
                    if (newPath.length > 0 && newPath[newPath.length - 1].type === 'alight') {
                        newPath[newPath.length - 1] = alightLeg; 
                    } else {
                        newPath.push(alightLeg);
                    }

                    queue.push({
                        st: edge.to,
                        arrTime: edge.absArr,
                        cost: nextCost,
                        path: newPath,
                        lastTrain: edge.trainId,
                        lastLine: edge.lineName
                    });
                }
            }
        }
    }

    renderPlannerResult(foundPath, from, to);
};

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

    let boardLeg = null;

    result.path.forEach((leg, i) => {
        if (leg.type === 'board') {
            boardLeg = leg;
        } else if (leg.type === 'alight' && boardLeg) {
            let textColor = window.getContrastColor ? window.getContrastColor(boardLeg.color) : '#fff';
            
            html += `<div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span class="line-badge" style="background-color: ${boardLeg.color}; color: ${textColor}; font-size: 11px;">${boardLeg.line}</span>
                    <span style="font-size: 11px; font-weight: 700; color: #38bdf8; cursor: pointer;" onclick="window.openSingleTrain('${boardLeg.train}')">${boardLeg.train}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #e2e8f0; margin-bottom: 4px;">
                    <span>${boardLeg.st}</span>
                    <span style="font-family: monospace; font-weight: 600;">${boardLeg.time}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8;">
                    <span>➔ ${leg.st}</span>
                    <span style="font-family: monospace;">${leg.time}</span>
                </div>
            </div>`;
            
            if (i < result.path.length - 1) {
                let nextBoard = result.path[i+1];
                if (nextBoard && nextBoard.type === 'board') {
                    if (nextBoard.isRealTransfer !== false) {
                        html += `<div style="text-align: center; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">▼ Přestup ▼</div>`;
                    } else {
                        html += `<div style="text-align: center; font-size: 10px; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px;">▼ Změna označení (Zůstaňte ve vlaku) ▼</div>`;
                    }
                }
            }
            boardLeg = null;
        }
    });

    html += `</div>`;
    resultsContainer.innerHTML = html;
    resultsContainer.style.display = 'block';
}
