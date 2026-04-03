// --- NEW FILE: js/transfers.js ---

// Determines if a station is a junction by checking if >1 distinct lines pass through it
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

// Helper function to figure out exactly which line a train belongs to at a specific station
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

    // Handle split lines based on geographic direction
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

// Core transfer logic
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
    let opCNotes = cNotes.filter(n => window.transferLogicData[n]); 
    if (opCNotes.length === 0) opCNotes = ["no note"];

    // NEW LOGIC: Gather all operating days (0-7) for the current train
    let cDays = new Set();
    for (let cN of opCNotes) {
        let days = window.transferLogicData[cN] || [];
        days.forEach(d => cDays.add(d));
    }

    let transfers = [];

    for (let pdf in window.timetablesData) {
        let trains = window.timetablesData[pdf].trains;
        if (!trains) continue;

        for (let tId in trains) {
            if (tId === currentTrainId) continue; // Skip itself
            let t = trains[tId];

            let stIdx = t.stops.findIndex(s => s.station === station);
            if (stIdx === -1) continue; // Doesn't stop here
            if (stIdx === t.stops.length - 1) continue; // Train terminates here (can't transfer to it)

            let depTime = t.stops[stIdx].departure || t.stops[stIdx].time;
            if (!depTime) continue;

            let depMins = window.timeToMins(depTime);
            if (depMins === 99999) continue;

            // Calculate difference, automatically handling midnight wrap-arounds
            let diff = (depMins - arrMins + 1440) % 1440;
            
            // 5 to 20 minute window
            if (diff >= 5 && diff <= 20) {
                let transLineObj = window.getTrainLineAtStation(tId, station);
                let transLineName = transLineObj ? transLineObj.lineName : null;
                let transColor = transLineObj ? transLineObj.color : "#94a3b8";

                // Exclude trains on the exact same line
                if (!transLineName || transLineName === currentLineName) continue;

                // Fetch candidate train's notes
                let tNotes = t.notes || [];
                let opTNotes = tNotes.filter(n => window.transferLogicData[n]);
                if (opTNotes.length === 0) opTNotes = ["no note"];

                // NEW LOGIC: Gather all operating days for the candidate transfer train
                let tDays = new Set();
                for (let tN of opTNotes) {
                    let days = window.transferLogicData[tN] || [];
                    days.forEach(d => tDays.add(d));
                }

                // NEW LOGIC: Check if they share at least one operating day (Intersection)
                let isCompatible = false;
                for (let day of cDays) {
                    if (tDays.has(day)) {
                        isCompatible = true;
                        break;
                    }
                }

                if (!isCompatible) continue; // Skip if they never run on the same day

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
    
    // Sort by soonest departure
    transfers.sort((a, b) => a.diff - b.diff);

    // Deduplicate in case a train ID exists across multiple JSON structures
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
