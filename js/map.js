function initializeMap() {
    const map = L.map('map').setView([49.4, 15.6], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);
    window.map = map;

    const segmentsMap = {};
    const stationLines = {};
    window.lineEndpoints = {}; 

    window.generateLineTooltipHtml = function(segData, isClick = false) {
        let destinationsHtml = "";
        for (const [routeLabel, data] of Object.entries(segData.destinations)) {
            const uniqueTrains = [...new Set(data.trains)].sort().join(', ');
            let trainsHtml = isClick ? `<div class="dest-trains">${uniqueTrains}</div>` : "";
            destinationsHtml += `<div class="dest-group"><div class="dest-row"><span>${routeLabel}</span><span class="dest-right"><span class="dest-count">${data.count}</span></span></div>${trainsHtml}</div>`;
        }
        const badgeTextColor = window.getContrastColor(segData.color);
        
        // On Desktop Popups, badges are clickable
        const pointerStyle = isClick ? 'cursor: pointer;' : 'pointer-events: none;';
        const clickAttr = isClick ? `onclick="window.openTimetable('${segData.lineName}')"` : '';
        
        return `<div class="tooltip-header"><span class="line-badge" style="background-color: ${segData.color}; color: ${badgeTextColor}; ${pointerStyle}" ${clickAttr}>${segData.lineName}</span></div>
                <div class="tooltip-segment">${segData.nodeA} ↔ ${segData.nodeB}</div>
                <div class="tooltip-connections">Celkem na úseku: ${segData.connections}</div>
                <div class="tooltip-destinations"><div style="font-size:11px; text-transform:uppercase; color:#64748b; margin-bottom:4px; letter-spacing:0.5px;">Přímá spojení</div>${destinationsHtml}</div>`;
    }

    // --- REVERTED MOBILE LOGIC (From vdv_rail_13) ---
    window.openSegmentModal = function(nodeA, nodeB, linesOnSegment) {
        const modal = document.getElementById('segment-modal');
        const content = document.getElementById('segment-modal-content');

        let buttonsHtml = linesOnSegment.map((seg, idx) => {
            const textColor = window.getContrastColor(seg.color);
            let endpointsText = "Zobrazit spojení...";
            if (window.lineEndpoints[seg.lineName]) {
                const data = window.lineEndpoints[seg.lineName];
                const endA = data.start < data.end ? data.start : data.end;
                const endB = data.start < data.end ? data.end : data.start;
                endpointsText = `${endA} ↔ ${endB}`;
            }
            return `<button class="modal-line-btn" onclick="showSegmentDetails(${idx})">
                        <span class="line-badge" style="background-color: ${seg.color}; color: ${textColor}; min-width:35px;">${seg.lineName}</span>
                        <span class="btn-text" style="font-weight: 600;">${endpointsText}</span>
                    </button>`;
        }).join('');

        content.innerHTML = `
            <div class="modal-header">
                <h3>${nodeA} ↔ ${nodeB}</h3>
                <button onclick="closeSegmentModal()" class="close-modal-btn">&times;</button>
            </div>
            <p style="color: #94a3b8; font-size: 13px; margin-bottom: 16px;">Na tomto úseku jezdí více linek. Kterou chcete zobrazit?</p>
            <div class="modal-line-list">${buttonsHtml}</div>
        `;

        window.currentSegmentLinesData = linesOnSegment;
        modal.style.display = 'flex';
    };

    window.showSegmentDetails = function(idx, isSingle = false) {
        const segData = window.currentSegmentLinesData[idx];
        const content = document.getElementById('segment-modal-content');
        const detailedHtml = window.generateLineTooltipHtml(segData, true);

        let headerHtml = isSingle 
            ? `<div class="modal-header" style="justify-content: flex-end;"><button onclick="closeSegmentModal()" class="close-modal-btn">&times;</button></div>`
            : `<div class="modal-header"><button onclick="openSegmentModal('${segData.nodeA}', '${segData.nodeB}', window.currentSegmentLinesData)" class="modal-back-btn">← Zpět</button><button onclick="closeSegmentModal()" class="close-modal-btn">&times;</button></div>`;

        let ttButton = `<div style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
                <button onclick="window.openTimetable('${segData.lineName}'); window.closeSegmentModal();" style="background: ${segData.color}; color: ${window.getContrastColor(segData.color)}; border: none; padding: 10px; border-radius: 6px; font-weight: 700; cursor: pointer; width: 100%;">Otevřít jízdní řád linky</button>
            </div>`;

        content.innerHTML = headerHtml + detailedHtml + ttButton;
        document.getElementById('segment-modal').style.display = 'flex';
    };

    window.closeSegmentModal = function() {
        document.getElementById('segment-modal').style.display = 'none';
    };

    // --- DATA PROCESSING & DRAWING ---
    window.routesData.forEach(route => {
        route.connections = route.trainNames ? route.trainNames.length : 0;
        const firstStation = route.waypoints[0];
        const lastStation = route.waypoints[route.waypoints.length - 1];

        if (route.changeAt && route.changesTo) {
            const changeIndex = route.waypoints.indexOf(route.changeAt);
            if (changeIndex !== -1) {
                if (!window.lineEndpoints[route.lineName] || (changeIndex + 1) > window.lineEndpoints[route.lineName].length) window.lineEndpoints[route.lineName] = { length: changeIndex + 1, start: firstStation, end: route.changeAt, color: route.color };
                if (!window.lineEndpoints[route.changesTo] || (route.waypoints.length - changeIndex) > window.lineEndpoints[route.changesTo].length) window.lineEndpoints[route.changesTo] = { length: route.waypoints.length - changeIndex, start: route.changeAt, end: lastStation, color: route.changeColor || route.color };
            }
        } else {
            if (!window.lineEndpoints[route.lineName] || route.waypoints.length > window.lineEndpoints[route.lineName].length) window.lineEndpoints[route.lineName] = { length: route.waypoints.length, start: firstStation, end: lastStation, color: route.color };
        }

        let currentLineName = route.lineName;
        let currentColor = route.color;
        let hasChanged = false;

        for (let i = 0; i < route.waypoints.length - 1; i++) {
            const st1 = route.waypoints[i], st2 = route.waypoints[i + 1];
            if (!window.stationsData[st1] || !window.stationsData[st2]) continue;
            if (route.changeAt && (st1 === route.changeAt || hasChanged)) { currentLineName = route.changesTo; currentColor = route.changeColor || route.color; hasChanged = true; }

            const nodeA = (window.stationsData[st1][1] > window.stationsData[st2][1]) ? st2 : st1;
            const nodeB = (nodeA === st1) ? st2 : st1;
            const segmentKey = `${nodeA}---${nodeB}`;

            if (!segmentsMap[segmentKey]) segmentsMap[segmentKey] = {};
            if (!segmentsMap[segmentKey][currentLineName]) segmentsMap[segmentKey][currentLineName] = { lineName: currentLineName, connections: 0, color: currentColor, nodeA: nodeA, nodeB: nodeB, destinations: {} };

            let label = (firstStation < lastStation) ? `${firstStation} ↔ ${lastStation}` : `${lastStation} ↔ ${firstStation}`;
            segmentsMap[segmentKey][currentLineName].connections += route.connections;
            if (!segmentsMap[segmentKey][currentLineName].destinations[label]) segmentsMap[segmentKey][currentLineName].destinations[label] = { count: 0, trains: [] };
            segmentsMap[segmentKey][currentLineName].destinations[label].count += route.connections;
            if (route.trainNames) segmentsMap[segmentKey][currentLineName].destinations[label].trains.push(...route.trainNames);
        }
    });

    Object.entries(segmentsMap).forEach(([segKey, linesObj]) => {
        const linesOnSegment = Object.values(linesObj).sort((a, b) => a.lineName.localeCompare(b.lineName));
        let totalThickness = 0;
        linesOnSegment.forEach(seg => { seg.thickness = (seg.connections * 0.22) + 2.5; totalThickness += seg.thickness; });
        let currentOffset = -totalThickness / 2;

        linesOnSegment.forEach((segData) => {
            const offset = currentOffset + (segData.thickness / 2);
            const latlngs = [ window.stationsData[segData.nodeA], window.stationsData[segData.nodeB] ];

            L.polyline(latlngs, { color: '#1a1a1a', weight: segData.thickness + 2.5, offset: offset, interactive: false }).addTo(map);
            L.polyline(latlngs, { color: segData.color, weight: segData.thickness, offset: offset, interactive: false }).addTo(map);

            const hitBoxWeight = window.isMobile ? Math.max(segData.thickness + 24, 30) : segData.thickness + 12;
            const interactionLine = L.polyline(latlngs, { color: 'transparent', weight: hitBoxWeight, offset: offset }).addTo(map);

            if (!window.isMobile) {
                interactionLine.bindTooltip(window.generateLineTooltipHtml(segData, false), { sticky: true });
                interactionLine.bindPopup(window.generateLineTooltipHtml(segData, true), { className: 'custom-popup' });
            } else {
                interactionLine.on('click', function() {
                    if (linesOnSegment.length === 1) {
                        window.currentSegmentLinesData = linesOnSegment;
                        window.showSegmentDetails(0, true);
                    } else {
                        window.openSegmentModal(segData.nodeA, segData.nodeB, linesOnSegment);
                    }
                });
            }
            currentOffset += segData.thickness + 2;
        });
    });

    // Station Marker Logic (Unchanged)
    for (const [name, coords] of Object.entries(window.stationsData)) {
        L.circleMarker(coords, { radius: 4, fillColor: "#ffffff", color: "#1a1a1a", weight: 2, opacity: 1, fillOpacity: 1 }).addTo(map)
         .bindTooltip(name, { className: 'simple-station-tooltip', direction: 'top', offset: [0, -10] });
    }
}
