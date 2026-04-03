// --- NEW FILE: js/planner.js ---

// 1. Setup Autocomplete for From/To inputs
function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    let suggBox = document.createElement('div');
    suggBox.className = 'autocomplete-list';
    suggBox.style.display = 'none';
    input.parentNode.appendChild(suggBox);

    input.addEventListener('input', function() {
        let val = this.value.toLowerCase();
        suggBox.innerHTML = '';
        if (!val) { suggBox.style.display = 'none'; return; }

        let stations = Object.keys(window.stationsData).filter(s => s.toLowerCase().includes(val));
        if (stations.length === 0) { suggBox.style.display = 'none'; return; }

        suggBox.style.display = 'block';
        stations.slice(0, 5).forEach(match => {
            let item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.innerHTML = match;
            item.addEventListener('click', () => {
                input.value = match;
                suggBox.style.display = 'none';
            });
            suggBox.appendChild(item);
        });
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input) suggBox.style.display = 'none';
    });
}

// 2. Helper to check if a train runs on the selected day
function trainRunsOnDay(notes, dayCode) {
    if (!notes || notes.length === 0) notes = ["no note"];
    let opNotes = notes.filter(n => window.transferLogicData[n]);
    if (opNotes.length === 0) opNotes = ["no note"];

    for (let n of opNotes) {
        let allowedDays = window.transferLogicData[n] || [];
        if (allowedDays.includes(dayCode.toString())) return true;
    }
    return false;
}

// 3. The Pathfinding Engine (Modified Dijkstra for Timetables)
window.calculateRoute = function() {
    const fromSt = document.getElementById('planner-from').value;
    const toSt = document.getElementById('planner-to').value;
    const dayCode = document.getElementById('planner-day').value;
    const timeStr = document.getElementById('planner-time').value;
    const resultsDiv = document.getElementById('planner-results');

    if (!window.stationsData[fromSt] || !window.stationsData[toSt]) {
        resultsDiv.innerHTML = `<div class="route-error">Zadejte platné stanice.</div>`;
        resultsDiv.style.display = 'block';
        return;
    }

    resultsDiv.innerHTML = `<div style="text-align:center; color:#94a3b8; font-size:12px;">Hledám nejlepší spojení...</div>`;
    resultsDiv.style.display = 'block';

    setTimeout(() => {
        let startMins = window.timeToMins(timeStr);
        
        // Priority Queue: sorted by current time
        let pq = [{ st: fromSt, time: startMins, trainId: null, path: [] }];
        let earliestArrival = {};
        earliestArrival[fromSt] = startMins;

        let bestPath = null;

        while (pq.length > 0) {
            pq.sort((a, b) => a.time - b.time);
            let curr = pq.shift();

            if (curr.st === toSt) {
                bestPath = curr.path;
                break;
            }

            for (let pdf in window.timetablesData) {
                let trains = window.timetablesData[pdf].trains;
                if (!trains) continue;

                for (let tId in trains) {
                    let train = trains[tId];
                    if (!trainRunsOnDay(train.notes, dayCode)) continue;

                    let sIdx = train.stops.findIndex(s => s.station === curr.st);
                    if (sIdx === -1 || sIdx === train.stops.length - 1) continue;

                    let depStr = train.stops[sIdx].departure || train.stops[sIdx].time;
                    if (!depStr) continue;
                    
                    let depMins = window.timeToMins(depStr);
                    // Standardize time to prevent overnight backward jumps
                    if (depMins < startMins && depMins + 1440 >= curr.time) depMins += 1440; 

                    // Minimum 3 minutes to change trains, 0 if staying on the same train
                    let transferBuffer = (curr.trainId === tId) ? 0 : 3;
                    if (depMins < curr.time + transferBuffer) continue;

                    // Evaluate destinations along this train
                    for (let j = sIdx + 1; j < train.stops.length; j++) {
                        let targetSt = train.stops[j].station;
                        let arrStr = train.stops[j].arrival || train.stops[j].time;
                        if (!arrStr) continue;
                        
                        let arrMins = window.timeToMins(arrStr);
                        if (arrMins < depMins) arrMins += 1440; // Crossed midnight

                        if (!earliestArrival[targetSt] || arrMins < earliestArrival[targetSt]) {
                            earliestArrival[targetSt] = arrMins;
                            
                            let lineObj = window.getTrainLineAtStation ? window.getTrainLineAtStation(tId, curr.st) : null;
                            let color = lineObj ? lineObj.color : '#94a3b8';
                            let lineName = lineObj ? lineObj.lineName : 'Vlak';

                            let newPath = [...curr.path, {
                                trainId: tId,
                                lineName: lineName,
                                color: color,
                                from: curr.st,
                                to: targetSt,
                                depTime: depStr,
                                arrTime: arrStr
                            }];
                            
                            pq.push({ st: targetSt, time: arrMins, trainId: tId, path: newPath });
                        }
                    }
                }
            }
        }

        // 4. Render Results
        if (bestPath) {
            let html = '';
            bestPath.forEach(leg => {
                let tColor = window.getContrastColor(leg.color);
                html += `
                    <div class="route-leg" style="border-color: ${leg.color};">
                        <div class="route-leg-header">
                            <span class="line-badge" style="background-color: ${leg.color}; color: ${tColor};">${leg.lineName}</span>
                            <span style="font-size:12px; font-weight:700; color:#38bdf8; cursor:pointer;" onclick="window.openSingleTrain('${leg.trainId}')">${leg.trainId}</span>
                        </div>
                        <div class="route-station"><span>${leg.from}</span> <span class="route-time">${leg.depTime}</span></div>
                        <div class="route-station" style="color:#cbd5e1;"><span>${leg.to}</span> <span class="route-time">${leg.arrTime}</span></div>
                    </div>
                `;
            });
            resultsDiv.innerHTML = html;
        } else {
            resultsDiv.innerHTML = `<div class="route-error">Nebylo nalezeno žádné spojení v tento den.</div>`;
        }
    }, 100); // Slight delay allows UI to render the "Searching..." text
};

// Initialize listeners once the DOM loads
document.addEventListener("DOMContentLoaded", () => {
    setupAutocomplete('planner-from');
    setupAutocomplete('planner-to');
});
