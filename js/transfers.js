// --- NEW FILE: js/transfers.js ---

window.isJunctionStation = function(station) {
    let lines = new Set();
    for (let r of window.routesData) {
        if (r.waypoints && r.waypoints.includes(station)) {
            let cIdx = r.changeAt ? r.waypoints.indexOf(r.changeAt) : -1;
            let stIdx = r.waypoints.indexOf(station);
            
            if (cIdx !== -1) {
                if (stIdx <= cIdx) lines.add(r.lineName);
                if (stIdx >= cIdx) lines.add(r.changesTo);
            } else {
                lines.add(r.lineName);
            }
        }
    }
    return lines.size > 1;
};

window.getTrainLineAtStation = function(trainId, station) {
    let matchedRoute = null;
    for (let r of window.routesData) {
        if (r.trainNames && r.trainNames.includes(trainId)) {
            matchedRoute = r;
            break;
        }
    }
    if (!matchedRoute) return null;

    let lineName = matchedRoute.lineName;
    let color = window.lineColorsDict[lineName] || matchedRoute.color || "#94a3b8";

    if (matchedRoute.changeAt && matchedRoute.changesTo) {
        let trainData = null;
        for (let pdf in window.timetablesData) {
            if (window.timetablesData[pdf].trains && window.timetablesData[pdf].trains[trainId]) {
                trainData = window.timetablesData[pdf].trains[trainId];
                break;
            }
        }
        if (trainData) {
            let rChangeIdx = matchedRoute.waypoints.indexOf(matchedRoute.changeAt);
            let line1Wps = matchedRoute.waypoints.slice(0, rChangeIdx + 1);
            let line2Wps = matchedRoute.waypoints.slice(rChangeIdx);
            
            let isBackward = false;
            for (let stop of trainData.stops) {
                if (stop.station === matchedRoute.changeAt) continue;
                if (line1Wps.includes(stop.station)) { isBackward = false; break; }
                if (line2Wps.includes(stop.station)) { isBackward = true; break; }
            }
            
            let stIdx = trainData.stops.findIndex(s => s.station === station);
            let chIdx = trainData.stops.findIndex(s => s.station === matchedRoute.changeAt);
            
            if (stIdx !== -1 && chIdx !== -1) {
                let isFirstHalf = stIdx <= chIdx; 
                if (stIdx === chIdx) isFirstHalf = false; 

                if (isBackward) {
                    lineName = isFirstHalf ? matchedRoute.changesTo : matchedRoute.lineName;
                } else {
                    lineName = isFirstHalf ? matchedRoute.lineName : matchedRoute.changesTo;
                }
                color = window.lineColorsDict[lineName] || "#94a3b8";
            }
        }
    }
    return { lineName, color };
};

window.findTransfers = function(station, arrivalTime, currentTrainId) {
    if (!window.isJunctionStation(station)) return [];

    if (!arrivalTime) return [];
    let arrMins = window.timeToMins(arrivalTime);
    if (arrMins === 99999) return [];

    let currentLineObj = window.getTrainLineAtStation(currentTrainId, station);
    let currentLineName = currentLineObj ? currentLineObj.lineName : null;

    // Fetch the current train's notes and normalize them
    let currentTrainObj = null;
    for (let pdf in window.timetablesData) {
        if (window.timetablesData[pdf].trains && window.timetablesData[pdf].trains[currentTrainId]) {
            currentTrainObj = window.timetablesData[pdf].trains[currentTrainId];
            break;
        }
    }
    let cNotes = (currentTrainObj && currentTrainObj.notes) ? currentTrainObj.notes : [];
    let opCNotes = cNotes.filter(n => window.transferLogicData[n]); // Keep only notes that exist in the logic JSON
    if (opCNotes.length === 0) opCNotes = ["no note"];

    let transfers = [];

    for (let pdf in window.timetablesData) {
        let trains = window.timetablesData[pdf].trains;
        if (!trains) continue;

        for (let tId in trains) {
            if (tId === currentTrainId) continue; 
            let t = trains[tId];

            let stIdx = t.stops.findIndex(s => s.station === station);
            if (stIdx === -1) continue; 
            if (stIdx === t.stops.length - 1) continue; 

            let depTime = t.stops[stIdx].departure || t.stops[stIdx].time;
            if (!depTime) continue;

            let depMins = window.timeToMins(depTime);
            if (depMins === 99999) continue;

            let diff = (depMins - arrMins + 1440) % 1440;
            
            if (diff >= 5 && diff <= 20) {
                let transLineObj = window.getTrainLineAtStation(tId, station);
                let transLineName = transLineObj ? transLineObj.lineName : null;
                let transColor = transLineObj ? transLineObj.color : "#94a3b8";

                if (!transLineName || transLineName === currentLineName) continue;

                // FIXED: Verify Operational Days Compatibility using your JSON matrix
                let tNotes = t.notes || [];
                let opTNotes = tNotes.filter(n => window.transferLogicData[n]);
                if (opTNotes.length === 0) opTNotes = ["no note"];

                let isCompatible = false;
                for (let cN of opCNotes) {
                    let allowed = window.transferLogicData[cN] || [];
                    for (let tN of opTNotes) {
                        if (allowed.includes(tN)) {
                            isCompatible = true;
                            break;
                        }
                    }
                    if (isCompatible) break;
                }

                if (!isCompatible) continue; // Skip if they run on non-overlapping days

                let destStation = t.stops[t.stops.length - 1].station;

                transfers.push({
                    trainId: tId,
                    lineName: transLineName,
                    color: transColor,
                    depTime: depTime,
                    destStation: destStation,
                    diff: diff,
                    notes: t.notes || [] // Pass notes to UI for display
                });
            }
        }
    }
    
    transfers.sort((a, b) => a.diff - b.diff);

    let uniqueTransfers = [];
    let seen = new Set();
    for (let tr of transfers) {
        let key = tr.trainId + tr.depTime;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueTransfers.push(tr);
        }
    }

    return uniqueTransfers;
};
