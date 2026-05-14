window.timetableHistory = [];
window.currentTimetableView = null;

window.goBackTimetable = function() {
    if (!window.timetableHistory || window.timetableHistory.length === 0) return;
    let prevState = window.timetableHistory.pop();
    
    if (prevState.type === 'line') {
        window.openTimetable(prevState.id, true, prevState.dirKey);
    } else if (prevState.type === 'train') {
        window.openSingleTrain(prevState.id, true);
    }
};

// --- FEATURE: Individual Train Timetable ---
window.openSingleTrain = function(trainId, isBack = false) {
    const ttModal = document.getElementById('tt-modal');
    const title = document.getElementById('tt-title');
    const controls = document.getElementById('tt-controls');
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');
    
    if (typeof window.map !== 'undefined') window.map.closePopup();
    if (document.getElementById('mobile-modal')) document.getElementById('mobile-modal').style.display = 'none';

    if (ttModal.style.display !== 'flex') {
        window.timetableHistory = [];
        window.currentTimetableView = null;
    }
    if (!isBack && window.currentTimetableView) {
        if (window.currentTimetableView.id !== trainId || window.currentTimetableView.type !== 'train') {
            window.timetableHistory.push(JSON.parse(JSON.stringify(window.currentTimetableView)));
        }
    }
    window.currentTimetableView = { type: 'train', id: trainId };

    let foundTrain = null;
    let vehicleType = "Neznámý";

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

    // FIXED: Add main train operational notes to the header
    let mainNotesHtml = "";
    if (foundTrain.notes && foundTrain.notes.length > 0) {
        mainNotesHtml = foundTrain.notes.map(n => `<span class="tt-note-badge" style="margin-left: 6px; font-size: 12px; padding: 2px 6px;">${n}</span>`).join('');
    }

    let vehicleHtml = vehicleType !== "Neznámý" ? `<span style="font-size: 13px; margin-left: auto; color: #38bdf8; font-weight: 600; padding: 4px 8px; background: rgba(56, 189, 248, 0.1); border-radius: 4px;">Vozidlo: ${vehicleType}</span>` : '';
    let backBtnHtml = window.timetableHistory.length > 0 ? `<button onclick="window.goBackTimetable()" style="background:none; border:none; color:#94a3b8; font-size:14px; font-weight:600; cursor:pointer; margin-right:16px; padding:4px 8px; border-radius:4px; transition:0.2s; display:flex; align-items:center;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'; this.style.color='#fff';" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#94a3b8';">← Zpět</button>` : '';
    
    title.innerHTML = `${backBtnHtml} ${badgeHtml} Vlak ${trainId} ${mainNotesHtml} ${vehicleHtml}`;
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

        if (idx > 0 && arr) {
            if (typeof window.findTransfers === 'function') {
                let transfers = window.findTransfers(s.station, arr, trainId);
                if (transfers.length > 0) {
                    let trHtml = `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">`;
                    transfers.forEach(tr => {
                        let tColor = window.getContrastColor(tr.color);
                        
                        // FIXED: Render notes badges in the transfer row
                        let transNotesHtml = "";
                        if (tr.notes && tr.notes.length > 0) {
                            transNotesHtml = tr.notes.map(n => `<span class="tt-note-badge" style="font-size: 9px; padding: 1px 3px; margin-left: 4px; vertical-align: middle;">${n}</span>`).join('');
                        }

                        trHtml += `
                            <div style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                                <span class="line-badge" style="background-color:${tr.color}; color:${tColor}; cursor: pointer;" onclick="window.openTimetable('${tr.lineName}'); event.stopPropagation();" title="Zobrazit linku ${tr.lineName}">${tr.lineName}</span>
                                <span style="font-size: 12px; font-weight: 700; color: #38bdf8; cursor: pointer; border-bottom: 1px dotted #38bdf8;" onclick="window.openSingleTrain('${tr.trainId}'); event.stopPropagation();" title="Zobrazit detail vlaku ${tr.trainId}">${tr.trainId}</span>
                                ${transNotesHtml}
                                <span style="font-family: monospace; font-size: 13px; color: #e2e8f0; font-weight: 600; margin-left: 4px;">${tr.depTime}</span>
                                <span style="font-size: 11px; color: #cbd5e1;">➔ ${tr.destStation}</span>
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
window.openTimetable = function(lineName, isBack = false, restoreDirKey = null) {
    const ttModal = document.getElementById('tt-modal');
    const title = document.getElementById('tt-title');
    const controls = document.getElementById('tt-controls');
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');
    
    if (typeof window.map !== 'undefined') window.map.closePopup();

    if (ttModal.style.display !== 'flex') {
        window.timetableHistory = [];
        window.currentTimetableView = null;
    }
    if (!isBack && window.currentTimetableView) {
        if (window.currentTimetableView.id !== lineName || window.currentTimetableView.type !== 'line') {
            window.timetableHistory.push(JSON.parse(JSON.stringify(window.currentTimetableView)));
        }
    }
    window.currentTimetableView = { type: 'line', id: lineName, dirKey: null };

    const lineColor = window.lineColorsDict[lineName] || '#ffffff';
    let backBtnHtml = window.timetableHistory.length > 0 ? `<button onclick="window.goBackTimetable()" style="background:none; border:none; color:#94a3b8; font-size:14px; font-weight:600; cursor:pointer; margin-right:16px; padding:4px 8px; border-radius:4px; transition:0.2s; display:flex; align-items:center;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'; this.style.color='#fff';" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#94a3b8';">← Zpět</button>` : '';

    title.innerHTML = `${backBtnHtml} <span class="line-badge" style="background-color:${lineColor}; color:${window.getContrastColor(lineColor)}; font-size: 16px; padding: 4px 12px; cursor: default;">${lineName}</span> Jízdní řád`;

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
    
    let initialDir = restoreDirKey && directions[restoreDirKey] ? restoreDirKey : dirKeys[0];
    window.renderTimetableGrid(initialDir);
    
    ttModal.style.display = 'flex';
};

window.renderTimetableGrid = function(trains) {
    // 1. PŘEDPOČÍTÁNÍ OMEZENÍ PRO KAŽDÝ VLAK (včetně přesné detekce odjezdu/příjezdu)
    trains.forEach(t => {
        t.stopRestrictions = t.stops.map(() => []); 
        if (t.notes && t.notes_validity) {
            t.notes.forEach((note, nIdx) => {
                let validity = t.notes_validity[nIdx];
                let startIdx = 0;
                let endIdx = t.stops.length - 1;
                
                if (validity !== "all" && Array.isArray(validity)) {
                    let startSt = validity[0];
                    let endSt = validity[1];
                    
                    // Start omezení: Hledáme nejpozdější výskyt stanice (tj. Odjezd)
                    for (let i = 0; i < t.stops.length; i++) {
                        if (t.stops[i].station === startSt) startIdx = i;
                    }
                    // Konec omezení: Hledáme nejdřívější výskyt stanice (tj. Příjezd)
                    let foundEnd = false;
                    for (let i = 0; i < t.stops.length; i++) {
                        if (t.stops[i].station === endSt && !foundEnd) {
                            endIdx = i;
                            foundEnd = true;
                        }
                    }
                }
                
                // Zápis do pole dané zastávky
                for (let i = startIdx; i <= endIdx; i++) {
                    if (i === startIdx || i === endIdx) {
                        t.stopRestrictions[i].push(note); // Krajní stanice
                    } else {
                        t.stopRestrictions[i].push('‖'); // Průjezdní stanice
                    }
                }
            });
        }
    });

    // 2. SESTAVENÍ MISTROVSKÉ OSY STANIC (Zahrnuje i zdvojené stanice pro příjezd a odjezd)
    let masterRows = [];
    trains.forEach(t => {
        let insertPos = 0;
        t.stops.forEach((s, i) => {
            let found = -1;
            for(let j = insertPos; j < masterRows.length; j++) {
                if(masterRows[j] === s.station) {
                    // Kontrola kontextu, abychom nesloučili příjezd s odjezdem
                    let isSecondInTrain = (i > 0 && t.stops[i-1].station === s.station);
                    let isSecondInMaster = (j > 0 && masterRows[j-1] === s.station);
                    if (isSecondInTrain === isSecondInMaster) {
                        found = j;
                        break;
                    }
                }
            }
            if (found !== -1) {
                insertPos = found + 1;
            } else {
                masterRows.splice(insertPos, 0, s.station);
                insertPos++;
            }
        });
    });

    // 3. DETEKCE GLOBÁLNÍCH ZASTÁVEK NA ZNAMENÍ
    let rowIsGlobalRequest = masterRows.map(() => true);
    masterRows.forEach((rowStation, rIdx) => {
        let hasAnyTrain = false;
        let isSecondInMaster = (rIdx > 0 && masterRows[rIdx-1] === rowStation);

        trains.forEach(t => {
            let stopMatches = t.stops.map((s, i) => ({ s: s, i: i })).filter(x => x.s.station === rowStation);
            let targetStop = null;
            if (stopMatches.length === 1) targetStop = stopMatches[0].s;
            else if (stopMatches.length > 1) {
                targetStop = isSecondInMaster ? stopMatches[1].s : stopMatches[0].s;
            }

            if (targetStop) {
                hasAnyTrain = true;
                if (!targetStop.request_stop) rowIsGlobalRequest[rIdx] = false;
            }
        });
        if (!hasAnyTrain) rowIsGlobalRequest[rIdx] = false;
    });

    // 4. VYKRESLOVÁNÍ HTML
    let html = `<table class="tt-table"><thead><tr><th class="sticky-col">Stanice</th>`;
    
    // Hlavičky vlaků napevno rozdělené na dva řádky
    trains.forEach(t => {
        let nameParts = t.id.split(' ');
        let type = nameParts[0] || '';
        let num = nameParts.slice(1).join(' ') || '';
        html += `<th style="vertical-align: bottom; height: 45px; padding: 6px 4px;">
                    <div style="line-height: 1.2;">${type}</div>
                    <div style="line-height: 1.2;">${num}</div>
                 </th>`;
    });
    html += `</tr></thead><tbody>`;

    // Samotné řádky s časy
    masterRows.forEach((rowStation, rIdx) => {
        let isSecondInMaster = (rIdx > 0 && masterRows[rIdx-1] === rowStation);
        let isFirstOfTwo = (rIdx < masterRows.length - 1 && masterRows[rIdx+1] === rowStation);
        
        let displayStation = rowStation;
        if (isSecondInMaster) displayStation += ` <span style="font-size:10px; color:#94a3b8;">(odj)</span>`;
        else if (isFirstOfTwo) displayStation += ` <span style="font-size:10px; color:#94a3b8;">(příj)</span>`;

        html += `<tr><td class="sticky-col">
            ${displayStation}
            ${rowIsGlobalRequest[rIdx] ? '<span class="station-req-mark">×</span>' : ''}
        </td>`;

        trains.forEach(t => {
            let stopMatches = t.stops.map((s, i) => ({ s: s, i: i })).filter(x => x.s.station === rowStation);
            let targetData = null;
            if (stopMatches.length === 1) targetData = stopMatches[0];
            else if (stopMatches.length > 1) {
                targetData = isSecondInMaster ? stopMatches[1] : stopMatches[0];
            }

            if (!targetData) {
                html += `<td></td>`;
            } else {
                let stop = targetData.s;
                let sIdx = targetData.i;
                
                // Omezení (více se naskládá pod sebe)
                let restrictions = t.stopRestrictions[sIdx] || [];
                let resHtml = restrictions.map(r => `<div style="line-height:1.1; margin-bottom:1px;">${r}</div>`).join('');

                html += `<td>
                    <div class="tt-time-container">
                        <div class="tt-restriction-col">${resHtml}</div>
                        <div class="tt-time-val">
                            ${stop.time}
                            ${ (!rowIsGlobalRequest[rIdx] && stop.request_stop) ? '<span style="color:#fbbf24; font-weight:bold; margin-left:2px;">×</span>' : '' }
                        </div>
                    </div>
                </td>`;
            }
        });
        html += `</tr>`;
    });

    // Patička "Pokračuje jako"
    if (trains.some(t => t.continuation)) {
        html += `<tr class="aux-row"><td class="sticky-col">Směřuje do</td>`;
        trains.forEach(t => {
            if (t.continuation) {
                let bHtml = `<span class="tt-sm-badge" style="background:${t.continuation.badgeColor}; color:${window.getContrastColor(t.continuation.badgeColor)}; cursor: pointer;" onclick="window.openTimetable('${t.continuation.lineBadge}')" title="Zobrazit jízdní řád linky ${t.continuation.lineBadge}">${t.continuation.lineBadge}</span>`;
                html += `<td><div class="aux-cell">${bHtml} <span class="tt-time" style="font-size:11px;">${t.continuation.time}</span><span>${t.continuation.station}</span></div></td>`;
            } else {
                html += `<td></td>`;
            }
        });
        html += `</tr>`;
    }

    html += `</tbody></table>`;
    return html;
};

window.closeTimetable = function() { 
    window.timetableHistory = [];
    window.currentTimetableView = null;
    document.getElementById('tt-modal').style.display = 'none'; 
};
