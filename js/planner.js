window.plannerGraphEdges = {}; // Grouped by starting station for hyper-fast searching

const DAYS_MAP = { "Pondělí": 1, "Úterý": 2, "Středa": 3, "Čtvrtek": 4, "Pátek": 5, "Sobota": 6, "Neděle": 7 };

// Gets line name and color for the UI
function getPlannerLineData(trainId) {
    let matchedRoute = window.routesData.find(r => r.trainNames && r.trainNames.includes(trainId));
    if (!matchedRoute) return { name: "Vlak", color: "#94a3b8" };
    // Simplified assumption: grabs base line color. (Advanced transfers logic can be applied here later if needed)
    return { name: matchedRoute.lineName, color: window.lineColorsDict[matchedRoute.lineName] || matchedRoute.color || "#94a3b8" };
}

// Builds the Absolute Minutes Graph
function buildPlannerGraph() {
    if (Object.keys(window.plannerGraphEdges).length > 0) return; // Only build once
    console.log("Stavím vyhledávací graf...");
    
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
                [1,2,3,4,5,6,7].forEach(d => days.add(d)); // No notes = runs daily
            } else {
                opNotes.forEach(n => {
                    (window.transferLogicData[n] || []).forEach(d => days.add(parseInt(d)));
                });
            }

            let lineData = getPlannerLineData(tId);

            days.forEach(day => {
                // Duplicate the train for "This Week" (W0) and "Next Week" (W1) to handle Sunday->Monday wrap arounds
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

                        // Midnight Crossing Logic
                        if (depMins < lastStopMins) depMins += 1440;
                        if (arrMins < depMins) arrMins += 1440;

                        let absDep = currentAbsMins + (depMins - lastStopMins);
                        let absArr = currentAbsMins + (arrMins - lastStopMins);

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
    console.log("Vyhledávací graf připraven!");
}

// The Pathfinding Engine (Time-Dependent Dijkstra)
window.runPlannerSearch = function() {
    buildPlannerGraph();
    
    let from = document.getElementById('planner-from').value.trim();
    let to = document.getElementById('planner-to').value.trim();
    let dayStr = document.getElementById('planner-day').value;
    let timeStr = document.getElementById('planner-time').value;

    if (!from || !to || !window.stationsData[from] || !window.stationsData[to]) {
        alert("Zadejte platné existující stanice. (Dbejte na překlepy)"); 
        return;
    }

    let dayNum = DAYS_MAP[dayStr] || 1;
    let userMins = window.timeToMins(timeStr);
    if (userMins === 99999) userMins = 0;
    
    let userAbsTime = (dayNum - 1) * 1440 + userMins;

    // Search State Queue: { station, time, path, lastTrain }
    let queue = [{ st: from, time: userAbsTime, path: [], lastTrain: null }];
    let bestTime = { [from]: userAbsTime };
    let foundPath = null;

    let loops = 0;
    // Simple priority queue loop
    while (queue.length > 0 && loops < 50000) {
        // Sort to always process the earliest arrival first
        queue.sort((a,b) => a.time - b.time); 
        let curr = queue.shift();
        loops++;

        if (curr.st === to) {
            foundPath = curr;
            break; // Earliest arrival found!
        }

        let edges = window.plannerGraphEdges[curr.st] || [];
        for (let edge of edges) {
            // Transfer logic: 5 minute minimum penalty if changing trains
            let isTransfer = curr.lastTrain && curr.lastTrain !== edge.trainId;
            let penalty = isTransfer ? 5 : 0;
            let canBoardTime = curr.time + penalty;

            // Find trains leaving AFTER our board time, but don't wait more than 24 hours
            if (edge.absDep >= canBoardTime && edge.absDep <= canBoardTime + 1440) {
                let nextAbsArr = edge.absArr;
                
                if (!bestTime[edge.to] || nextAbsArr < bestTime[edge.to]) {
                    bestTime[edge.to] = nextAbsArr;

                    // Build the journey log
                    let newPath = [...curr.path];
                    if (isTransfer || curr.path.length === 0) {
                        newPath.push({ type: 'board', st: curr.st, train: edge.trainId, line: edge.lineName, color: edge.color, time: edge.depStr });
                    }
                    // Overwrite the alight leg to represent the final stop on this specific train
                    let alightLeg = { type: 'alight', st: edge.to, train: edge.trainId, line: edge.lineName, color: edge.color, time: edge.arrStr };
                    
                    if (newPath.length > 0 && newPath[newPath.length - 1].type === 'alight') {
                        newPath[newPath.length - 1] = alightLeg; 
                    } else {
                        newPath.push(alightLeg);
                    }

                    queue.push({
                        st: edge.to,
                        time: nextAbsArr,
                        path: newPath,
                        lastTrain: edge.trainId
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
        alert("Spojení nebylo nalezeno.");
        return;
    }

    formContainer.style.display = 'none'; // Hide form
    
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
            
            // Check if there is a transfer after this
            if (i < result.path.length - 1) {
                html += `<div style="text-align: center; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">▼ Přestup ▼</div>`;
            }
            boardLeg = null;
        }
    });

    html += `</div>`;
    resultsContainer.innerHTML = html;
    resultsContainer.style.display = 'block';
}
