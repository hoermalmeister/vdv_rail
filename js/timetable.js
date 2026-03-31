// --- NEW FEATURE: Individual Train Timetable ---
window.openSingleTrain = function(trainId) {
    const ttModal = document.getElementById('tt-modal');
    const title = document.getElementById('tt-title');
    const controls = document.getElementById('tt-controls');
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');
    
    // Close map popups and mobile segment menus to clear the view
    if (typeof window.map !== 'undefined') window.map.closePopup();
    if (document.getElementById('mobile-modal')) document.getElementById('mobile-modal').style.display = 'none';

    let foundTrain = null;
    let vehicleType = "Neznámý";

    // Search the timetables for this specific train and extract vehicle type from the filename
    for (let pdf in window.timetablesData) {
        if (window.timetablesData[pdf].trains && window.timetablesData[pdf].trains[trainId]) {
            foundTrain = JSON.parse(JSON.stringify(window.timetablesData[pdf].trains[trainId]));
            
            const types = ["BEMU", "EMU130", "EMU140", "DMU120", "DMU70"];
            for (let type of types) {
                if (pdf.includes(type)) {
                    vehicleType = type;
                    break;
                }
            }
            break;
        }
    }

    if (!foundTrain) {
        alert("Spojení nebylo nalezeno.");
        return;
    }

    // Determine the primary line colors to use in the header and detect line changes
    let matchedRoute = null;
    for (let r of window.routesData) {
        if (r.trainNames && r.trainNames.includes(trainId)) {
            matchedRoute = r;
            break;
        }
    }

    let badgeHtml = "";
    let endLineName = "";
    let endLineColor = "";

    if (matchedRoute) {
        let isBackward = false;
        
        if (matchedRoute.changeAt && matchedRoute.changesTo) {
            let rChangeIdx = matchedRoute.waypoints.indexOf(matchedRoute.changeAt);
            let line1Wps = matchedRoute.waypoints.slice(0, rChangeIdx + 1);
            let line2Wps = matchedRoute.waypoints.slice(rChangeIdx);
            
            for (let stop of foundTrain.stops) {
                if (stop.station === matchedRoute.changeAt) continue;
                if (line1Wps.includes(stop.station)) { isBackward = false; break; }
                if (line2Wps.includes(stop.station)) { isBackward = true; break; }
            }
        }

        let startLine = isBackward ? matchedRoute.changesTo : matchedRoute.lineName;
        let startColor = isBackward 
            ? (window.lineColorsDict[startLine] || matchedRoute.changeColor || "#94a3b8") 
            : (window.lineColorsDict[startLine] || matchedRoute.color || "#94a3b8");
        let text1 = window.getContrastColor(startColor);

        badgeHtml += `<span class="line-badge" style="background-color:${startColor}; color:${text1}; font-size: 16px; padding: 4px 12px; margin-right: 8px; cursor: pointer;" onclick="window.openTimetable('${startLine}')" title="Zobrazit jízdní řád linky ${startLine}">${startLine}</span>`;

        if (matchedRoute.changeAt && matchedRoute.changesTo) {
            endLineName = isBackward ? matchedRoute.lineName : matchedRoute.changesTo;
            endLineColor = isBackward 
                ? (window.lineColorsDict[endLineName] || matchedRoute.color || "#94a3b8") 
                : (window.lineColorsDict[endLineName] || matchedRoute.changeColor || "#94a3b8");
            let text2 = window.getContrastColor(endLineColor);
            
            badgeHtml += `<span style="color: #94a3b8; margin-right: 8px; font-size: 14px;">➔</span>`;
            badgeHtml += `<span class="line-badge" style="background-color:${endLineColor}; color:${text2}; font-size: 16px; padding: 4px 12px; margin-right: 8px; cursor: pointer;" onclick="window.openTimetable('${endLineName}')" title="Zobrazit jízdní řád linky ${endLineName}">${endLineName}</span>`;
        }
    }

    let vehicleHtml = vehicleType !== "Neznámý" ? `<span style="font-size: 13px; margin-left: auto; color: #38bdf8; font-weight: 600; padding: 4px 8px; background: rgba(56, 189, 248, 0.1); border-radius: 4px;">Vozidlo: ${vehicleType}</span>` : '';
    
    title.innerHTML = `${badgeHtml} Vlak ${trainId} ${vehicleHtml}`;
    controls.innerHTML = ''; 

    let html = `<table class="modern-tt" style="width: 100%; text-align: left;">
        <thead>
            <tr>
                <th class="sticky-col sticky-top-1">Stanice</th>
                <th class="sticky-top-1" style="text-align: center;">Příjezd</th>
                <th class="sticky-top-1" style="text-align: center;">Odjezd</th>
            </tr>
        </thead>
        <tbody>`;

    let mergedStops = [];
    for (let i = 0; i < foundTrain.stops.length; i++) {
        let currentStop = foundTrain.stops[i];
        let nextStop = foundTrain.stops[i + 1];

        if (nextStop && currentStop.station === nextStop.station) {
            mergedStops.push({
                station: currentStop.station,
                arrival: currentStop.arrival || currentStop.time || '',
                departure: nextStop.departure || nextStop.time || '',
                request_stop: currentStop.request_stop || nextStop.request_stop
            });
            i++; 
        } else {
            mergedStops.push({
                station: currentStop.station,
                arrival: currentStop.arrival || currentStop.time || '',
                departure: currentStop.departure || currentStop.time || '',
                request_stop: currentStop.request_stop
            });
        }
    }

    mergedStops.forEach((s, idx) => {
        let req = s.request_stop ? `<span class="tt-req">×</span>` : '';
        let arr = s.arrival;
        let dep = s.departure;
        
        if (idx === 0) arr = ''; 
        if (idx === mergedStops.length - 1) dep = ''; 

        let arrHtml = arr ? `${req}<span class="tt-time">${arr}</span>` : '<span style="color:#475569;">-</span>';
        let depHtml = dep ? `${req}<span class="tt-time">${dep}</span>` : '<span style="color:#475569;">-</span>';

        html += `<tr>
            <td class="sticky-col">${s.station}</td>
            <td style="text-align: center;">${arrHtml}</td>
            <td style="text-align: center;">${depHtml}</td>
        </tr>`;

        // FIXED: Inject Transfer Logic right under the station
        // Skips the first station (idx > 0)
        if (idx > 0 && arr) {
            if (typeof window.findTransfers === 'function') {
                let transfers = window.findTransfers(s.station, arr, trainId);
                if (transfers.length > 0) {
                    let trHtml = `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">`;
                    transfers.forEach(tr => {
                        let tColor = window.getContrastColor(tr.color);
                        trHtml += `
                            <div style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                                <span class="line-badge" style="background-color:${tr.color}; color:${tColor}; cursor: pointer;" onclick="window.openTimetable('${tr.lineName}'); event.stopPropagation();" title="Zobrazit linku ${tr.lineName}">${tr.lineName}</span>
                                <span style="font-family: monospace; font-size: 13px; color: #e2e8f0; font-weight: 600;">${tr.depTime}</span>
                                <span style="font-size: 11px; color: #cbd5e1; cursor: pointer; border-bottom: 1px dotted transparent;" onmouseover="this.style.borderColor='#38bdf8'" onmouseout="this.style.borderColor='transparent'" onclick="window.openSingleTrain('${tr.trainId}'); event.stopPropagation();" title="Zobrazit detail vlaku ${tr.trainId}">➔ ${tr.destStation}</span>
                            </div>
                        `;
                    });
                    trHtml += `</div>`;
                    
                    html += `<tr class="aux-row">
                        <td colspan="3" style="padding: 8px 12px; background-color: #141b2d;">
                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Možné přestupy:</div>
                            ${trHtml}
                        </td>
                    </tr>`;
                }
            }
        }

        if (matchedRoute && matchedRoute.changeAt && endLineName && s.station === matchedRoute.changeAt && idx < mergedStops.length - 1) {
            let text2 = window.getContrastColor(endLineColor);
            html += `<tr class="aux-row">
                <td colspan="3" style="text-align: center; padding: 6px;">
                    <span style="font-size: 11px; color: #94a3b8;">Vlak dále pokračuje jako linka</span> 
                    <span class="line-badge" style="background-color:${endLineColor}; color:${text2}; cursor: pointer; margin-left: 6px;" onclick="window.openTimetable('${endLineName}')" title="Zobrazit jízdní řád linky ${endLineName}">${endLineName}</span>
                </td>
            </tr>`;
        }
    });

    html += `</tbody></table>`;
    content.innerHTML = html;

    let fHtml = `<div class="legend-grid">`;
    if (foundTrain.notes && foundTrain.notes.length > 0) {
        foundTrain.notes.forEach(note => {
            fHtml += `<div class="note-item"><span class="note-sym">${note}</span> ${window.notesDict[note] || "Neznámá poznámka"}</div>`;
        });
    }
    fHtml += `<div class="note-item" style="margin-left: auto;"><span class="note-sym tt-req" style="font-size:16px;">×</span> Zastávka na znamení</div></div>`;
    footer.innerHTML = fHtml;

    ttModal.style.display = 'flex';
};

// --- EXISTING FEATURE: Full Line Timetable ---
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

    function buildMaster(trainsList) {
        let master = [];
        let sortedTrains = [...trainsList].sort((a,b) => b.stops.length - a.stops.length);
        
        if (sortedTrains.length === 0) return master;
        
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
    trains.forEach(t => html += `<th class="sticky-top-1"><span onclick="window.openSingleTrain('${t.id}'); event.stopPropagation();" style="cursor: pointer;" title="Zobrazit detail vlaku">${t.id}</span></th>`);
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
                let bHtml = `<span class="tt-sm-badge" style="background:${t.origin.badgeColor}; color:${window.getContrastColor(t.origin.badgeColor)}; cursor: pointer;" onclick="window.openTimetable('${t.origin.lineBadge}')" title="Zobrazit jízdní řád linky ${t.origin.lineBadge}">${t.origin.lineBadge}</span>`;
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
                let bHtml = `<span class="tt-sm-badge" style="background:${t.continuation.badgeColor}; color:${window.getContrastColor(t.continuation.badgeColor)}; cursor: pointer;" onclick="window.openTimetable('${t.continuation.lineBadge}')" title="Zobrazit jízdní řád linky ${t.continuation.lineBadge}">${t.continuation.lineBadge}</span>`;
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
