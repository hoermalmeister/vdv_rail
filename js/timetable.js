window.openTimetable = function(lineName) {
    const ttModal = document.getElementById('tt-modal');
    const title = document.getElementById('tt-title');
    const controls = document.getElementById('tt-controls');
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');
    
    if (typeof map !== 'undefined') map.closePopup();

    const lineColor = window.lineColorsDict[lineName] || '#ffffff';
    const textColor = window.getContrastColor(lineColor);
    title.innerHTML = `<span class="line-badge" style="background-color:${lineColor}; color:${textColor}; font-size: 16px; padding: 4px 12px; cursor: default;">${lineName}</span> Jízdní řád`;

    let lineTrains = new Set();

    window.routesData.forEach(r => {
        if (r.lineName === lineName || r.changesTo === lineName) {
            if (r.trainNames) r.trainNames.forEach(t => lineTrains.add(t));
        }
    });

    let extractedTrains = [];
    for (let pdf in window.timetablesData) {
        let tDict = window.timetablesData[pdf].trains;
        if(!tDict) continue;
        
        lineTrains.forEach(tId => {
            if (tDict[tId]) {
                let tClone = JSON.parse(JSON.stringify(tDict[tId]));
                tClone.id = tId;

                let matchedRoute = window.routesData.find(r => (r.lineName === lineName || r.changesTo === lineName) && r.trainNames && r.trainNames.includes(tId));
                
                if (matchedRoute && matchedRoute.changeAt) {
                    let changeIdx = tClone.stops.findIndex(s => s.station === matchedRoute.changeAt);
                    
                    if (changeIdx !== -1) {
                        let rChangeIdx = matchedRoute.waypoints.indexOf(matchedRoute.changeAt);
                        let line1Waypoints = matchedRoute.waypoints.slice(0, rChangeIdx + 1);
                        let line2Waypoints = matchedRoute.waypoints.slice(rChangeIdx);

                        let trainStartDir = 0; 
                        for (let stop of tClone.stops) {
                            if (stop.station === matchedRoute.changeAt) continue;
                            if (line1Waypoints.includes(stop.station)) { trainStartDir = 1; break; }
                            if (line2Waypoints.includes(stop.station)) { trainStartDir = 2; break; }
                        }

                        let isFirstHalfOfArray = false;
                        if (matchedRoute.lineName === lineName) { 
                            isFirstHalfOfArray = (trainStartDir === 1); 
                        } else if (matchedRoute.changesTo === lineName) { 
                            isFirstHalfOfArray = (trainStartDir === 2); 
                        }

                        if (isFirstHalfOfArray) {
                            let finalStop = tClone.stops[tClone.stops.length - 1];
                            tClone.stops = tClone.stops.slice(0, changeIdx + 1);
                            
                            if (finalStop.station !== matchedRoute.changeAt) {
                                let nextLine = (matchedRoute.lineName === lineName) ? matchedRoute.changesTo : matchedRoute.lineName;
                                tClone.continuation = {
                                    station: finalStop.station,
                                    time: finalStop.arrival || finalStop.time || finalStop.departure,
                                    lineBadge: nextLine,
                                    badgeColor: matchedRoute.changeColor || window.lineColorsDict[nextLine] || '#94a3b8'
                                };
                            }
                        } else {
                            let firstStop = tClone.stops[0];
                            tClone.stops = tClone.stops.slice(changeIdx);
                            
                            if (firstStop.station !== matchedRoute.changeAt) {
                                let prevLine = (matchedRoute.lineName === lineName) ? matchedRoute.changesTo : matchedRoute.lineName;
                                tClone.origin = {
                                    station: firstStop.station,
                                    time: firstStop.departure || firstStop.time || firstStop.arrival,
                                    lineBadge: prevLine,
                                    badgeColor: matchedRoute.color || window.lineColorsDict[prevLine] || '#94a3b8'
                                };
                            }
                        }
                    }
                }

                if (!extractedTrains.some(et => et.id === tId)) extractedTrains.push(tClone);
            }
        });
    }

    if (extractedTrains.length === 0) {
        content.innerHTML = `<div style="padding:24px; text-align:center; color:#94a3b8;">Pro tuto linku zatím nejsou k dispozici data.</div>`;
        controls.innerHTML = ''; footer.innerHTML = '';
        ttModal.style.display = 'flex';
        return;
    }

    let dir1Trains = []; let dir2Trains = [];
    let refTrain = extractedTrains.reduce((prev, current) => (prev.stops.length > current.stops.length) ? prev : current, extractedTrains[0]);
    let refStops = refTrain.stops.map(s => s.station);

    extractedTrains.forEach(t => {
        let tStops = t.stops.map(s => s.station);
        let shared = tStops.filter(s => refStops.includes(s));
        if (shared.length >= 2) {
            let refIdx1 = refStops.indexOf(shared[0]), refIdx2 = refStops.indexOf(shared[shared.length - 1]);
            let tIdx1 = tStops.indexOf(shared[0]), tIdx2 = tStops.indexOf(shared[shared.length - 1]);
            if ((refIdx1 < refIdx2) === (tIdx1 < tIdx2)) dir1Trains.push(t); else dir2Trains.push(t);
        } else dir1Trains.push(t); 
    });

    // FLAWLESS FIX: Directed Acyclic Graph (DAG) Topological Sort for Station Order
    function buildMaster(trainsList) {
        let adj = {};
        let inDegree = {};
        let stations = new Set();

        // Register all nodes
        trainsList.forEach(t => {
            t.stops.forEach(s => {
                stations.add(s.station);
                if (!adj[s.station]) adj[s.station] = new Set();
                if (inDegree[s.station] === undefined) inDegree[s.station] = 0;
            });
        });

        // Build directed edges (A precedes B)
        trainsList.forEach(t => {
            for (let i = 0; i < t.stops.length - 1; i++) {
                let u = t.stops[i].station;
                let v = t.stops[i+1].station;
                if (!adj[u].has(v)) {
                    adj[u].add(v);
                    inDegree[v] = (inDegree[v] || 0) + 1;
                }
            }
        });

        // Kahn's Algorithm
        let queue = [];
        let master = [];

        stations.forEach(st => {
            if (inDegree[st] === 0) queue.push(st);
        });

        while (queue.length > 0) {
            let u = queue.shift();
            master.push(u);
            adj[u].forEach(v => {
                inDegree[v]--;
                if (inDegree[v] === 0) queue.push(v);
            });
        }

        // Failsafe for cycles (Should not happen in schedules)
        stations.forEach(st => {
            if (!master.includes(st)) master.push(st);
        });

        return master;
    }

    let master1 = buildMaster(dir1Trains);
    let master2 = buildMaster(dir2Trains);

    let directions = {};
    if (master1.length > 0) directions[`Směr ${master1[master1.length-1]}`] = { masterStations: master1, trains: dir1Trains };
    if (master2.length > 0) directions[`Směr ${master2[master2.length-1]}`] = { masterStations: master2, trains: dir2Trains };

    let dirKeys = Object.keys(directions);
    controls.innerHTML = dirKeys.map((key, idx) => `<button class="dir-btn ${idx === 0 ? 'active' : ''}" onclick="window.renderTimetableGrid('${key}')">${key}</button>`).join('');

    window.currentTimetableData = directions;
    window.renderTimetableGrid(dirKeys[0]);
    ttModal.style.display = 'flex';
};

window.renderTimetableGrid = function(dirKey) {
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText === dirKey) btn.classList.add('active');
    });

    const data = window.currentTimetableData[dirKey];
    const trains = data.trains;
    const masterStations = data.masterStations;
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');

    let usedNotes = new Set();
    
    // Stable Shared-Station Time Sorting
    trains.sort((a, b) => {
        let sharedSt = masterStations.find(st => a.stops.some(s => s.station === st) && b.stops.some(s => s.station === st));
        if (sharedSt) {
            let sA = a.stops.find(s => s.station === sharedSt);
            let sB = b.stops.find(s => s.station === sharedSt);
            return window.timeToMins(sA.departure || sA.time || sA.arrival) - window.timeToMins(sB.departure || sB.time || sB.arrival);
        }
        return window.timeToMins(a.stops[0].departure || a.stops[0].time || a.stops[0].arrival) - window.timeToMins(b.stops[0].departure || b.stops[0].time || b.stops[0].arrival);
    });

    let html = `<table class="modern-tt"><thead><tr><th class="sticky-col sticky-top-1">Stanice</th>`;
    trains.forEach(t => { html += `<th class="sticky-top-1">${t.id}</th>`; });
    html += `</tr><tr class="tt-note-row"><th class="sticky-col sticky-top-2"></th>`;
    
    trains.forEach(t => {
        let notesHtml = [];
        (t.notes || []).forEach((n, idx) => {
            let validity = (t.notes_validity && t.notes_validity[idx]) ? t.notes_validity[idx] : null;
            usedNotes.add(n);
            if (validity && validity.toLowerCase() !== "all") {
                notesHtml.push(`<span class="tt-note-badge clickable-note" onclick="alert('Poznámka ${n}\\nPlatí pouze pro úsek:\\n${validity}')" title="Klikněte pro zobrazení úseku">${n}*</span>`);
            } else {
                notesHtml.push(`<span class="tt-note-badge">${n}</span>`);
            }
        });
        html += `<th class="sticky-top-2">${notesHtml.join(' ')}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Ze směru
    let hasOrigins = trains.some(t => t.origin);
    if (hasOrigins) {
        html += `<tr class="aux-row"><td class="sticky-col">Ze směru</td>`;
        trains.forEach(t => {
            if (t.origin) {
                let fg = window.getContrastColor(t.origin.badgeColor);
                let bHtml = `<span class="tt-sm-badge" style="background:${t.origin.badgeColor}; color:${fg};">${t.origin.lineBadge}</span>`;
                html += `<td><div class="aux-cell">${bHtml} <span class="tt-time" style="font-size:11px;">${t.origin.time}</span><span>${t.origin.station}</span></div></td>`;
            } else html += `<td></td>`;
        });
        html += `</tr>`;
    }

    // MAIN STATIONS GRID
    masterStations.forEach(station => {
        html += `<tr><td class="sticky-col">${station}</td>`;
        trains.forEach(t => {
            let s_list = t.stops.filter(s => s.station === station);
            
            let firstStopIdx = masterStations.indexOf(t.stops[0].station);
            let lastStopIdx = masterStations.indexOf(t.stops[t.stops.length - 1].station);
            let currentStIdx = masterStations.indexOf(station);
            
            if (s_list.length > 0) {
                let reqIcon = s_list.some(s => s.request_stop) ? `<span class="tt-req">×</span>` : '';
                if (s_list.length === 1 && !s_list[0].arrival && !s_list[0].departure) {
                    html += `<td>${reqIcon}<span class="tt-time">${s_list[0].time || ''}</span></td>`;
                } else {
                    let arrTime = s_list[0].arrival || s_list[0].time;
                    let depTime = s_list[s_list.length - 1].departure || s_list[s_list.length - 1].time;
                    if (arrTime === depTime) {
                        html += `<td>${reqIcon}<span class="tt-time">${arrTime}</span></td>`;
                    } else {
                        html += `<td>
                            <div class="arr-dep-box">
                                <div class="arr-time">${reqIcon}<span class="time-lbl">př</span><span class="tt-time">${arrTime}</span></div>
                                <div class="dep-time"><span class="time-lbl">od</span><span class="tt-time">${depTime}</span></div>
                            </div>
                        </td>`;
                    }
                }
            } else {
                if (currentStIdx > firstStopIdx && currentStIdx < lastStopIdx) {
                    html += `<td><span class="tt-pass">|</span></td>`;
                } else {
                    html += `<td></td>`;
                }
            }
        });
        html += `</tr>`;
    });

    // Směřuje do
    let hasContinuations = trains.some(t => t.continuation);
    if (hasContinuations) {
        html += `<tr class="aux-row"><td class="sticky-col">Směřuje do</td>`;
        trains.forEach(t => {
            if (t.continuation) {
                let fg = window.getContrastColor(t.continuation.badgeColor);
                let bHtml = `<span class="tt-sm-badge" style="background:${t.continuation.badgeColor}; color:${fg};">${t.continuation.lineBadge}</span>`;
                html += `<td><div class="aux-cell">${bHtml} <span class="tt-time" style="font-size:11px;">${t.continuation.time}</span><span>${t.continuation.station}</span></div></td>`;
            } else html += `<td></td>`;
        });
        html += `</tr>`;
    }
    
    html += `</tbody></table>`;
    content.innerHTML = html;

    let footerHtml = `<div class="legend-grid">`;
    usedNotes.forEach(note => {
        let meaning = window.notesDict[note] || "Neznámá poznámka";
        footerHtml += `<div class="note-item"><span class="note-sym">${note}</span> ${meaning}</div>`;
    });
    footerHtml += `<div class="note-item" style="margin-left: auto;"><span class="note-sym tt-req" style="font-size:16px;">×</span> Zastávka na znamení</div></div>`;
    footer.innerHTML = footerHtml;
};

window.closeTimetable = function() {
    document.getElementById('tt-modal').style.display = 'none';
};
