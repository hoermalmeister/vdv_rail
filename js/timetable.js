window.openTimetable = function(lineName) {
    const ttModal = document.getElementById('tt-modal');
    const title = document.getElementById('tt-title');
    const controls = document.getElementById('tt-controls');
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');
    
    if (typeof map !== 'undefined') map.closePopup();

    const lineColor = window.lineColorsDict[lineName] || '#ffffff';
    title.innerHTML = `<span class="line-badge" style="background-color:${lineColor}; color:${window.getContrastColor(lineColor)}; font-size: 16px; padding: 4px 12px; cursor: default;">${lineName}</span> Jízdní řád`;

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

                // Slicing logic (Unchanged from approved version)
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
                        let isFirstHalf = (matchedRoute.lineName === lineName) ? (trainStartDir === 1) : (trainStartDir === 2);
                        if (isFirstHalf) {
                            let finalStop = tClone.stops[tClone.stops.length - 1];
                            tClone.stops = tClone.stops.slice(0, changeIdx + 1);
                            if (finalStop.station !== matchedRoute.changeAt) {
                                let nextLine = (matchedRoute.lineName === lineName) ? matchedRoute.changesTo : matchedRoute.lineName;
                                tClone.continuation = { station: finalStop.station, time: finalStop.arrival || finalStop.time, lineBadge: nextLine, badgeColor: window.lineColorsDict[nextLine] };
                            }
                        } else {
                            let firstStop = tClone.stops[0];
                            tClone.stops = tClone.stops.slice(changeIdx);
                            if (firstStop.station !== matchedRoute.changeAt) {
                                let prevLine = (matchedRoute.lineName === lineName) ? matchedRoute.changesTo : matchedRoute.lineName;
                                tClone.origin = { station: firstStop.station, time: firstStop.departure || firstStop.time, lineBadge: prevLine, badgeColor: window.lineColorsDict[prevLine] };
                            }
                        }
                    }
                }
                if (!extractedTrains.some(et => et.id === tId)) extractedTrains.push(tClone);
            }
        });
    }

    if (extractedTrains.length === 0) {
        content.innerHTML = `<div style="padding:24px; text-align:center; color:#94a3b8;">Data nejsou k dispozici.</div>`;
        return;
    }

    // Direction Grouping
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

    // BACKBONE STRATEGY: Build master list from routes.json junctions first
    function buildMaster(trainsList) {
        let master = [];
        window.routesData.forEach(r => {
            if (r.lineName === lineName || r.changesTo === lineName) {
                let wps = r.waypoints;
                if (r.changeAt) {
                    let cIdx = wps.indexOf(r.changeAt);
                    wps = (r.lineName === lineName) ? wps.slice(0, cIdx + 1) : wps.slice(cIdx);
                }
                wps.forEach(wp => { if (!master.includes(wp)) master.push(wp); });
            }
        });

        trainsList.forEach(t => {
            let lastIdx = -1;
            t.stops.forEach(s => {
                let idx = master.indexOf(s.station);
                if (idx !== -1) lastIdx = idx;
                else {
                    if (lastIdx !== -1) { master.splice(lastIdx + 1, 0, s.station); lastIdx++; }
                    else { master.unshift(s.station); lastIdx = 0; }
                }
            });
        });
        return [...new Set(master)];
    }

    let m1 = buildMaster(dir1Trains);
    let m2 = buildMaster(dir2Trains);
    let directions = {};
    if (m1.length > 0) directions[`Směr ${m1[m1.length-1]}`] = { masterStations: m1, trains: dir1Trains };
    if (m2.length > 0) directions[`Směr ${m2[m2.length-1]}`] = { masterStations: m2, trains: dir2Trains };

    let dirKeys = Object.keys(directions);
    controls.innerHTML = dirKeys.map((key, idx) => `<button class="dir-btn ${idx === 0 ? 'active' : ''}" onclick="window.renderTimetableGrid('${key}')">${key}</button>`).join('');
    window.currentTimetableData = directions;
    window.renderTimetableGrid(dirKeys[0]);
    ttModal.style.display = 'flex';
};

window.renderTimetableGrid = function(dirKey) {
    document.querySelectorAll('.dir-btn').forEach(btn => btn.classList.toggle('active', btn.innerText === dirKey));
    const { masterStations, trains } = window.currentTimetableData[dirKey];
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');

    // Sorting (Unchanged)
    trains.sort((a, b) => {
        let shared = masterStations.find(st => a.stops.some(s => s.station === st) && b.stops.some(s => s.station === st));
        if (shared) {
            let sA = a.stops.find(s => s.station === shared);
            let sB = b.stops.find(s => s.station === shared);
            return window.timeToMins(sA.departure || sA.time) - window.timeToMins(sB.departure || sB.time);
        }
        return window.timeToMins(a.stops[0].departure || a.stops[0].time) - window.timeToMins(b.stops[0].departure || b.stops[0].time);
    });

    let html = `<table class="modern-tt"><thead><tr><th class="sticky-col sticky-top-1">Stanice</th>`;
    trains.forEach(t => html += `<th class="sticky-top-1">${t.id}</th>`);
    html += `</tr><tr class="tt-note-row"><th class="sticky-col sticky-top-2"></th>`;
    trains.forEach(t => html += `<th class="sticky-top-2">${(t.notes || []).join(' ')}</th>`);
    html += `</tr></thead><tbody>`;

    if (trains.some(t => t.origin)) {
        html += `<tr class="aux-row"><td class="sticky-col">Ze směru</td>`;
        trains.forEach(t => {
            if (t.origin) {
                let bHtml = `<span class="tt-sm-badge" style="background:${t.origin.badgeColor}; color:${window.getContrastColor(t.origin.badgeColor)};">${t.origin.lineBadge}</span>`;
                html += `<td><div class="aux-cell">${bHtml} <span class="tt-time" style="font-size:11px;">${t.origin.time}</span><span>${t.origin.station}</span></div></td>`;
            } else html += `<td></td>`;
        });
        html += `</tr>`;
    }

    masterStations.forEach(station => {
        html += `<tr><td class="sticky-col">${station}</td>`;
        trains.forEach(t => {
            let s_list = t.stops.filter(s => s.station === station);
            let first = masterStations.indexOf(t.stops[0].station), last = masterStations.indexOf(t.stops[t.stops.length-1].station), curr = masterStations.indexOf(station);
            if (s_list.length > 0) {
                let time = s_list[0].time || s_list[0].departure || s_list[0].arrival;
                html += `<td><span class="tt-time">${time}</span></td>`;
            } else {
                html += `<td>${(curr > first && curr < last) ? '<span class="tt-pass">|</span>' : ''}</td>`;
            }
        });
        html += `</tr>`;
    });

    if (trains.some(t => t.continuation)) {
        html += `<tr class="aux-row"><td class="sticky-col">Směřuje do</td>`;
        trains.forEach(t => {
            if (t.continuation) {
                let bHtml = `<span class="tt-sm-badge" style="background:${t.continuation.badgeColor}; color:${window.getContrastColor(t.continuation.badgeColor)};">${t.continuation.lineBadge}</span>`;
                html += `<td><div class="aux-cell">${bHtml} <span class="tt-time" style="font-size:11px;">${t.continuation.time}</span><span>${t.continuation.station}</span></div></td>`;
            } else html += `<td></td>`;
        });
        html += `</tr>`;
    }
    html += `</tbody></table>`;
    content.innerHTML = html;
};

window.closeTimetable = function() { document.getElementById('tt-modal').style.display = 'none'; };
