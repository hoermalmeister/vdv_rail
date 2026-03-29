window.openTimetable = function(lineName) {
    const ttModal = document.getElementById('tt-modal');
    const title = document.getElementById('tt-title');
    const controls = document.getElementById('tt-controls');
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');
    
    if (typeof window.map !== 'undefined') window.map.closePopup();

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

                let matchedRoute = window.routesData.find(r => (r.lineName === lineName || r.changesTo === lineName) && r.trainNames && r.trainNames.includes(tId));
                if (matchedRoute && matchedRoute.changeAt) {
                    let changeIdx = tClone.stops.findIndex(s => s.station === matchedRoute.changeAt);
                    if (changeIdx !== -1) {
                        let rChangeIdx = matchedRoute.waypoints.indexOf(matchedRoute.changeAt);
                        let line1Wps = matchedRoute.waypoints.slice(0, rChangeIdx + 1);
                        let line2Wps = matchedRoute.waypoints.slice(rChangeIdx);
                        
                        let trainStartDir = 0; 
                        for (let stop of tClone.stops) {
                            if (stop.station === matchedRoute.changeAt) continue;
                            if (line1Wps.includes(stop.station)) { trainStartDir = 1; break; }
                            if (line2Wps.includes(stop.station)) { trainStartDir = 2; break; }
                        }

                        let isFirstHalf = (matchedRoute.lineName === lineName) ? (trainStartDir === 1) : (trainStartDir === 2);
                        if (isFirstHalf) {
                            let finalStop = tClone.stops[tClone.stops.length - 1];
                            tClone.stops = tClone.stops.slice(0, changeIdx + 1);
                            if (finalStop.station !== matchedRoute.changeAt) {
                                let nextL = (matchedRoute.lineName === lineName) ? matchedRoute.changesTo : matchedRoute.lineName;
                                tClone.continuation = { station: finalStop.station, time: finalStop.arrival || finalStop.time || finalStop.departure, lineBadge: nextL, badgeColor: window.lineColorsDict[nextL] };
                            }
                        } else {
                            let firstStop = tClone.stops[0];
                            tClone.stops = tClone.stops.slice(changeIdx);
                            if (firstStop.station !== matchedRoute.changeAt) {
                                let prevL = (matchedRoute.lineName === lineName) ? matchedRoute.changesTo : matchedRoute.lineName;
                                tClone.origin = { station: firstStop.station, time: firstStop.departure || firstStop.time || firstStop.arrival, lineBadge: prevL, badgeColor: window.lineColorsDict[prevL] };
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
        controls.innerHTML = ''; document.getElementById('tt-footer').innerHTML = '';
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

    function buildMaster(trainsList) {
        let master = [];
        let sortedTrains = [...trainsList].sort((a,b) => b.stops.length - a.stops.length);
        
        if (sortedTrains.length === 0) return master;
        
        // Backbone Strategy for complex lines (S14 fix)
        sortedTrains.forEach(t => {
            let lastMasterIdx = -1;
            t.stops.forEach(s => {
                let idx = master.indexOf(s.station);
                if (idx !== -1) {
                    lastMasterIdx = idx;
                } else {
                    let nextIdx = -1;
                    let tStops = t.stops.map(st => st.station);
                    let currTIdx = tStops.indexOf(s.station);
                    for (let k = currTIdx + 1; k < tStops.length; k++) {
                        let nIdx = master.indexOf(tStops[k]);
                        if (nIdx !== -1) { nextIdx = nIdx; break; }
                    }

                    if (lastMasterIdx !== -1) {
                        master.splice(lastMasterIdx + 1, 0, s.station);
                        lastMasterIdx++;
                    } else if (nextIdx !== -1) {
                        master.splice(nextIdx, 0, s.station);
                    } else {
                        master.push(s.station);
                        lastMasterIdx = master.length - 1;
                    }
                }
            });
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
    document.querySelectorAll('.dir-btn').forEach(btn => btn.classList.toggle('active', btn.innerText === dirKey));
    const { masterStations, trains } = window.currentTimetableData[dirKey];
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');

    let usedNotes = new Set();
    
    trains.sort((a, b) => {
        let shared = masterStations.find(st => a.stops.some(s => s.station === st) && b.stops.some(s => s.station === st));
        if (shared) {
            let sA = a.stops.find(s => s.station === shared);
            let sB = b.stops.find(s => s.station === shared);
            return window.timeToMins(sA.departure || sA.time || sA.arrival) - window.timeToMins(sB.departure || sB.time || sB.arrival);
        }
        return window.timeToMins(a.stops[0].departure || a.stops[0].time || a.stops[0].arrival) - window.timeToMins(b.stops[0].departure || b.stops[0].time || b.stops[0].arrival);
    });

    let html = `<table class="modern-tt"><thead><tr><th class="sticky-col sticky-top-1">Stanice</th>`;
    trains.forEach(t => html += `<th class="sticky-top-1">${t.id}</th>`);
    html += `</tr><tr class="tt-note-row"><th class="sticky-col sticky-top-2"></th>`;
    trains.forEach(t => {
        let nHtml = [];
        (t.notes || []).forEach((n, i) => {
            let v = (t.notes_validity && t.notes_validity[i]) ? t.notes_validity[i] : null;
            usedNotes.add(n);
            if (v && v.toLowerCase() !== "all") nHtml.push(`<span class="tt-note-badge clickable-note" onclick="alert('Poznámka ${n}\\nPlatí pouze pro úsek:\\n${v}')" title="Klikněte pro zobrazení úseku">${n}*</span>`);
            else nHtml.push(`<span class="tt-note-badge">${n}</span>`);
        });
        html += `<th class="sticky-top-2">${nHtml.join(' ')}</th>`;
    });
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
            let sList = t.stops.filter(s => s.station === station);
            let fIdx = masterStations.indexOf(t.stops[0].station), lIdx = masterStations.indexOf(t.stops[t.stops.length-1].station), cIdx = masterStations.indexOf(station);
            
            if (sList.length > 0) {
                let rIcon = sList.some(s => s.request_stop) ? `<span class="tt-req">×</span>` : '';
                if (sList.length === 1 && !sList[0].arrival && !sList[0].departure) {
                    html += `<td>${rIcon}<span class="tt-time">${sList[0].time || ''}</span></td>`;
                } else {
                    let aT = sList[0].arrival || sList[0].time, dT = sList[sList.length - 1].departure || sList[sList.length - 1].time;
                    if (aT === dT) html += `<td>${rIcon}<span class="tt-time">${aT}</span></td>`;
                    else html += `<td><div class="arr-dep-box"><div class="arr-time">${rIcon}<span class="time-lbl">př</span><span class="tt-time">${aT}</span></div><div class="dep-time"><span class="time-lbl">od</span><span class="tt-time">${dT}</span></div></div></td>`;
                }
            } else {
                html += `<td>${(cIdx > fIdx && cIdx < lIdx) ? '<span class="tt-pass">|</span>' : ''}</td>`;
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

    let fHtml = `<div class="legend-grid">`;
    usedNotes.forEach(note => fHtml += `<div class="note-item"><span class="note-sym">${note}</span> ${window.notesDict[note] || "Neznámá poznámka"}</div>`);
    fHtml += `<div class="note-item" style="margin-left: auto;"><span class="note-sym tt-req" style="font-size:16px;">×</span> Zastávka na znamení</div></div>`;
    footer.innerHTML = fHtml;
};

window.closeTimetable = function() { document.getElementById('tt-modal').style.display = 'none'; };
