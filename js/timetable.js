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

// PŘEDVÝPOČET OMEZENÍ: Ukládá přesné zóny platnosti pro částečná omezení
function computeTrainRestrictions(train) {
    train.stops.forEach(s => s.res = { arr: [], dep: [] }); 
    train.noteIsPartial = [];
    train.partialRanges = [];

    if (train.notes && train.notes_validity) {
        train.notes.forEach((note, nIdx) => {
            let validity = train.notes_validity[nIdx];
            let isPartial = false;
            let startSt = null, endSt = null;

            if (validity && validity !== "all") {
                isPartial = true;
                if (Array.isArray(validity) && validity.length >= 2) {
                    startSt = validity[0]; endSt = validity[1];
                } else if (typeof validity === 'string') {
                    let parts = validity.split('-');
                    if (parts.length >= 2) {
                        startSt = parts[0].trim(); endSt = parts[1].trim();
                    } else {
                        startSt = validity.trim(); endSt = validity.trim();
                    }
                }
            }

            train.noteIsPartial.push(isPartial);
            train.partialRanges.push({ startSt, endSt });

            // Zápis omezení přímo k zastávkám
            if (isPartial && startSt && endSt) {
                let sIdx = -1, eIdx = -1;
                
                for(let i=0; i<train.stops.length; i++) {
                    if(window.removeDiacritics(train.stops[i].station).toLowerCase().trim() === window.removeDiacritics(startSt).toLowerCase().trim()) sIdx = i;
                }
                for(let i=0; i<train.stops.length; i++) {
                    if(window.removeDiacritics(train.stops[i].station).toLowerCase().trim() === window.removeDiacritics(endSt).toLowerCase().trim() && eIdx === -1) eIdx = i;
                }

                if (sIdx !== -1 && eIdx !== -1) {
                    if (sIdx > eIdx) { let tmp = sIdx; sIdx = eIdx; eIdx = tmp; }
                    
                    for (let i = sIdx; i <= eIdx; i++) {
                        if (sIdx === eIdx) {
                            train.stops[i].res.arr.push(note);
                            train.stops[i].res.dep.push(note);
                        } else if (i === sIdx) {
                            train.stops[i].res.dep.push(note);
                        } else if (i === eIdx) {
                            train.stops[i].res.arr.push(note);
                        } else {
                            train.stops[i].res.arr.push('‖');
                            train.stops[i].res.dep.push('‖');
                        }
                    }
                }
            }
        });
    }
}

// SPOLEČNÁ FUNKCE PRO ZAROVNÁNÍ
function renderLabelAndTime(resArr, defaultLbl, timeStr, reqStr) {
    let lblHtml = '';
    resArr = resArr.filter(x => x);

    if (resArr && resArr.length > 0) {
        lblHtml = `<span style="color: #fbbf24; font-weight: 700; font-size: 11px; line-height: 1.1; display: block;">${resArr.join('<br>')}</span>`;
    } else if (defaultLbl) {
        lblHtml = `<span style="color: #64748b; font-weight: normal; font-size: 11px; line-height: 1.1; display: block;">${defaultLbl}</span>`;
    }

    return `<div style="display: grid; grid-template-columns: 24px 1fr 24px; align-items: center; width: 100%;">
                <div style="text-align: right; padding-right: 6px;">
                    ${lblHtml}
                </div>
                <div style="text-align: center; white-space: nowrap; color: #e2e8f0;">
                    ${reqStr}${timeStr || ''}
                </div>
                <div></div>
            </div>`;
}

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

    computeTrainRestrictions(foundTrain);

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

    let mainNotesHtml = "";
    if (foundTrain.notes && foundTrain.notes.length > 0) {
        mainNotesHtml = foundTrain.notes.map((n, i) => {
            let ast = foundTrain.noteIsPartial[i] ? '*' : '';
            return `<span class="tt-note-badge" style="margin-left: 6px; font-size: 12px; padding: 2px 6px;">${n}${ast}</span>`;
        }).join('');
    }

    let vehicleHtml = vehicleType !== "Neznámý" ? `<span style="font-size: 13px; margin-left: auto; color: #38bdf8; font-weight: 600; padding: 4px 8px; background: rgba(56, 189, 248, 0.1); border-radius: 4px;">Vozidlo: ${vehicleType}</span>` : '';
    let backBtnHtml = window.timetableHistory.length > 0 ? `<button onclick="window.goBackTimetable()" style="background:none; border:none; color:#94a3b8; font-size:14px; font-weight:600; cursor:pointer; margin-right:16px; padding:4px 8px; border-radius:4px; transition:0.2s; display:flex; align-items:center;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'; this.style.color='#fff';" onmouseout="this.style.backgroundColor='transparent'; this.style.color='#94a3b8';">← Zpět</button>` : '';
    
    title.innerHTML = `${backBtnHtml} ${badgeHtml} Vlak ${trainId} ${mainNotesHtml} ${vehicleHtml}`;
    controls.innerHTML = ''; 

    let html = `<table class="modern-tt" style="width: 100%; border-collapse: separate; border-spacing: 0;">
        <thead>
            <tr>
                <th class="sticky-col sticky-top-1" style="background-color: #1e293b; z-index: 15; position: sticky; top: 0; height: 45px; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.1);">Stanice</th>
                <th class="sticky-top-1" style="background-color: #1e293b; z-index: 12; position: sticky; top: 0; height: 45px; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.1);">Příjezd</th>
                <th class="sticky-top-1" style="background-color: #1e293b; z-index: 12; position: sticky; top: 0; height: 45px; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.1);">Odjezd</th>
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
                request_stop: currentStop.request_stop || nextStop.request_stop,
                arrRes: currentStop.res.arr,
                depRes: nextStop.res.dep
            });
            i++; 
        } else {
            mergedStops.push({
                station: currentStop.station,
                arrival: currentStop.arrival || currentStop.time || '',
                departure: currentStop.departure || currentStop.time || '',
                request_stop: currentStop.request_stop,
                arrRes: currentStop.res.arr,
                depRes: currentStop.res.dep
            });
        }
    }

    // Detekce aktivního rozsahu pro rozpoznání průjezdu vs ukončené trasy
    let firstActive = -1, lastActive = -1;
    mergedStops.forEach((s, idx) => {
        if (s.arrival || s.departure) {
            if (firstActive === -1) firstActive = idx;
            lastActive = idx;
        }
    });

    mergedStops.forEach((s, idx) => {
        let reqStationMark = s.request_stop ? `<span style="color:#fbbf24; font-weight:bold; margin-left:6px; font-size:15px;">×</span>` : '';
        let reqTimeMark = ''; 
        
        let arr = s.arrival;
        let dep = s.departure;
        
        if (idx === 0) arr = ''; 
        if (idx === mergedStops.length - 1) dep = ''; 

        let aResRaw = [...new Set(s.arrRes || [])];
        let dResRaw = [...new Set(s.depRes || [])];

        let getArrHtml = () => {
            if (!arr) {
                let isPassing = idx > firstActive && idx < lastActive;
                let char = isPassing ? '|' : '-';
                let res = isPassing && aResRaw.length > 0 ? aResRaw : [];
                return renderLabelAndTime(res, '', `<span style="color:#475569;">${char}</span>`, '');
            }
            return renderLabelAndTime(aResRaw, '', arr, reqTimeMark);
        };

        let getDepHtml = () => {
            if (!dep) {
                let isPassing = idx > firstActive && idx < lastActive;
                let char = isPassing ? '|' : '-';
                let res = isPassing && dResRaw.length > 0 ? dResRaw : [];
                return renderLabelAndTime(res, '', `<span style="color:#475569;">${char}</span>`, '');
            }
            return renderLabelAndTime(dResRaw, '', dep, reqTimeMark);
        };

        html += `<tr>
            <td class="sticky-col">${s.station}${reqStationMark}</td>
            <td>${getArrHtml()}</td>
            <td>${getDepHtml()}</td>
        </tr>`;

        if (idx > 0 && arr) {
            if (typeof window.findTransfers === 'function') {
                let transfers = window.findTransfers(s.station, arr, trainId);
                if (transfers.length > 0) {
                    let trHtml = `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">`;
                    transfers.forEach(tr => {
                        let tColor = window.getContrastColor(tr.color);
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
                        <td colspan="3" style="padding: 8px 12px; background-color: #141b2d; text-align: left;">
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
    fHtml += `<div class="note-item" style="margin-left: auto;"><span style="color:#fbbf24; font-weight:bold; margin-right:4px; font-size:16px;">×</span> Zastávka na znamení</div></div>`;
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
                
                computeTrainRestrictions(tClone);

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

window.renderTimetableGrid = function(dirKey) {
    document.querySelectorAll('.dir-btn').forEach(btn => btn.classList.toggle('active', btn.innerText === dirKey));
    
    if (window.currentTimetableView && window.currentTimetableView.type === 'line') {
        window.currentTimetableView.dirKey = dirKey;
    }

    const { masterStations, trains } = window.currentTimetableData[dirKey];
    const content = document.getElementById('tt-content');
    const footer = document.getElementById('tt-footer');

    trains.sort((a, b) => {
        let shared = masterStations.find(st => a.stops.some(s => s.station === st) && b.stops.some(s => s.station === st));
        if (shared) {
            let sA = a.stops.find(s => s.station === shared);
            let sB = b.stops.find(s => s.station === shared);
            return window.timeToMins(sA.departure || sA.time || sA.arrival) - window.timeToMins(sB.departure || sB.time || sB.arrival);
        }
        return window.timeToMins(a.stops[0].departure || a.stops[0].time || a.stops[0].arrival) - window.timeToMins(b.stops[0].departure || b.stops[0].time || b.stops[0].arrival);
    });

    let rowIsGlobalRequest = masterStations.map(() => true);
    masterStations.forEach((station, rIdx) => {
        let anyTrainStops = false;
        trains.forEach(t => {
            let sList = t.stops.filter(s => s.station === station);
            if (sList.length > 0) {
                anyTrainStops = true;
                sList.forEach(s => {
                    if (!s.request_stop) rowIsGlobalRequest[rIdx] = false;
                });
            }
        });
        if (!anyTrainStops) rowIsGlobalRequest[rIdx] = false;
    });

    let html = `<table class="modern-tt" style="border-collapse: separate; border-spacing: 0;"><thead><tr>
                <th class="sticky-col sticky-top-1" style="background-color: #1e293b; z-index: 15; position: sticky; top: 0; height: 50px; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.1);">Stanice</th>`;
    
    trains.forEach(t => {
        let parts = t.id.split(' ');
        let type = parts[0] || '';
        let num = parts.slice(1).join(' ') || '';
        html += `<th class="sticky-top-1" style="vertical-align: bottom; height: 50px; padding: 6px 4px; background-color: #1e293b; z-index: 12; position: sticky; top: 0; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div onclick="window.openSingleTrain('${t.id}'); event.stopPropagation();" style="cursor: pointer; line-height: 1.2; display: inline-block;" title="Zobrazit detail vlaku">
                        <div>${type}</div>
                        <div>${num}</div>
                    </div>
                 </th>`;
    });
    
    html += `</tr><tr class="tt-note-row"><th class="sticky-col sticky-top-2" style="background-color: #1e293b; z-index: 14; position: sticky; top: 50px; height: 26px; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.1);"></th>`;
    
    trains.forEach(t => {
        let nHtml = [];
        (t.notes || []).forEach((n, i) => {
            if (t.noteIsPartial[i]) {
                let range = t.partialRanges[i];
                let titleStr = (range.startSt && range.endSt) ? `Úsek: ${range.startSt} - ${range.endSt}` : 'Částečné omezení';
                nHtml.push(`<span class="tt-note-badge" title="${titleStr}" style="cursor:help;">${n}*</span>`);
            } else {
                nHtml.push(`<span class="tt-note-badge">${n}</span>`);
            }
        });
        html += `<th class="sticky-top-2" style="background-color: #1e293b; z-index: 11; position: sticky; top: 50px; height: 26px; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.1);">${nHtml.join(' ')}</th>`;
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

    masterStations.forEach((station, rIdx) => {
        let reqMark = rowIsGlobalRequest[rIdx] ? `<span style="color:#fbbf24; font-weight:bold; margin-left:6px; font-size:15px;">×</span>` : '';
        html += `<tr><td class="sticky-col">${station}${reqMark}</td>`;
        
        trains.forEach(t => {
            let sList = t.stops.filter(s => s.station === station);
            let fIdx = masterStations.indexOf(t.stops[0]?.station);
            let lIdx = masterStations.indexOf(t.stops[t.stops.length-1]?.station);
            let cIdx = masterStations.indexOf(station);
            
            if (sList.length > 0) {
                let aT = sList[0].arrival || sList[0].time;
                let dT = sList[sList.length - 1].departure || sList[sList.length - 1].time;

                let aReq = (!rowIsGlobalRequest[rIdx] && sList[0].request_stop) ? `<span style="color:#fbbf24; font-weight:bold; margin-right:4px;">×</span>` : '';
                let dReq = (!rowIsGlobalRequest[rIdx] && sList[sList.length - 1].request_stop) ? `<span style="color:#fbbf24; font-weight:bold; margin-right:4px;">×</span>` : '';

                let aResRaw = [...new Set(sList[0].res.arr || [])];
                let dResRaw = [...new Set(sList[sList.length - 1].res.dep || [])];

                let isPassing = !aT && !dT;
                
                if (isPassing) {
                    let combinedRes = [...new Set([...aResRaw, ...dResRaw])];
                    if (combinedRes.length > 0) {
                        html += `<td>${renderLabelAndTime(combinedRes, '', '<span style="color:#475569;">|</span>', '')}</td>`;
                    } else {
                        html += `<td>${renderLabelAndTime([], '', '<span style="color:#475569;">|</span>', '')}</td>`;
                    }
                } else if ((sList.length === 1 && !sList[0].arrival && !sList[0].departure) || (aT === dT)) {
                    let combinedRes = [...new Set([...aResRaw, ...dResRaw])];
                    let tToPrint = aT || sList[0].time || '';
                    html += `<td>${renderLabelAndTime(combinedRes, '', tToPrint, aReq)}</td>`;
                } else {
                    html += `<td>
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            ${renderLabelAndTime(aResRaw, 'př', aT, aReq)}
                            ${renderLabelAndTime(dResRaw, 'od', dT, dReq)}
                        </div>
                    </td>`;
                }
            } else {
                // Dynamické dokreslení chybějící průjezdné stanice v rámci omezení
                let restrictedPass = false;
                if (cIdx > fIdx && cIdx < lIdx) {
                    if (t.notes && t.notes_validity) {
                        t.notes.forEach((n, idx) => {
                            if (t.noteIsPartial && t.noteIsPartial[idx]) {
                                let range = t.partialRanges[idx];
                                if (range && range.startSt && range.endSt) {
                                    let sMIdx = -1, eMIdx = -1;
                                    for(let i=0; i<masterStations.length; i++) if(window.removeDiacritics(masterStations[i]).toLowerCase().trim() === window.removeDiacritics(range.startSt).toLowerCase().trim()) sMIdx = i;
                                    for(let i=0; i<masterStations.length; i++) if(window.removeDiacritics(masterStations[i]).toLowerCase().trim() === window.removeDiacritics(range.endSt).toLowerCase().trim() && eMIdx === -1) eMIdx = i;
                                    
                                    if (sMIdx !== -1 && eMIdx !== -1) {
                                        let min = Math.min(sMIdx, eMIdx);
                                        let max = Math.max(sMIdx, eMIdx);
                                        if (cIdx > min && cIdx < max) restrictedPass = true;
                                    }
                                }
                            }
                        });
                    }
                }

                if (cIdx > fIdx && cIdx < lIdx) {
                    if (restrictedPass) {
                        html += `<td>${renderLabelAndTime(['‖'], '', '<span style="color:#475569;">|</span>', '')}</td>`;
                    } else {
                        html += `<td>${renderLabelAndTime([], '', '<span style="color:#475569;">|</span>', '')}</td>`;
                    }
                } else {
                    html += `<td></td>`;
                }
            }
        });
        html += `</tr>`;
    });

    if (trains.some(t => t.continuation)) {
        html += `<tr class="aux-row"><td class="sticky-col">Směřuje do</td>`;
        trains.forEach(t => {
            if (t.continuation) {
                let bHtml = `<span class=\"tt-sm-badge\" style=\"background:${t.continuation.badgeColor}; color:${window.getContrastColor(t.continuation.badgeColor)}; cursor: pointer;\" onclick=\"window.openTimetable('${t.continuation.lineBadge}')\" title=\"Zobrazit jízdní řád linky ${t.continuation.lineBadge}\">${t.continuation.lineBadge}</span>`;
                html += `<td><div class=\"aux-cell\">${bHtml} <span class=\"tt-time\" style=\"font-size:11px;\">${t.continuation.time}</span><span>${t.continuation.station}</span></div></td>`;
            } else html += `<td></td>`;
        });
        html += `</tr>`;
    }
    
    html += `</tbody></table>`;
    content.innerHTML = html;

    let fHtml = `<div class="legend-grid">`;
    let allUsedNotes = new Set();
    trains.forEach(t => (t.notes||[]).forEach(n => allUsedNotes.add(n)));
    allUsedNotes.forEach(note => fHtml += `<div class="note-item"><span class="note-sym">${note}</span> ${window.notesDict[note] || "Neznámá poznámka"}</div>`);
    
    fHtml += `<div class="note-item" style="margin-left: auto;"><span style="color:#fbbf24; font-weight:bold; margin-right:4px; font-size:16px;">×</span> Zastávka na znamení</div></div>`;
    footer.innerHTML = fHtml;
};

window.closeTimetable = function() { 
    window.timetableHistory = [];
    window.currentTimetableView = null;
    document.getElementById('tt-modal').style.display = 'none'; 
};
