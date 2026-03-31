// --- NEW FILE: js/transfers.js ---

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
                if (stIdx === chIdx) isFirstHalf = false; // Departure from the change station operates as the 2nd line

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
    if (!arrivalTime) return [];
    let arrMins = window.timeToMins(arrivalTime);
    if (arrMins === 99999) return [];

    let currentLineObj = window.getTrainLineAtStation(currentTrainId, station);
    let currentLineName = currentLineObj ? currentLineObj.lineName : null;

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

                let destStation = t.stops[t.stops.length - 1].station;

                transfers.push({
                    trainId: tId,
                    lineName: transLineName,
                    color: transColor,
                    depTime: depTime,
                    destStation: destStation,
                    diff: diff
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
