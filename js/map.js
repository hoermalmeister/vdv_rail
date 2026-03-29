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
        
        // Clickable badges for Desktop Popups
        const pointerStyle = isClick ? 'cursor: pointer;' : 'pointer-events: none;';
        const clickAttr = isClick ? `onclick="window.openTimetable('${segData.lineName}')"` : '';
        
        return `<div class="tooltip-header"><span class="line-badge" style="background-color: ${segData.color}; color: ${badgeTextColor}; ${pointerStyle}" ${clickAttr}>${segData.lineName}</span></div>
                <div class="tooltip-segment">${segData.nodeA} ↔ ${segData.nodeB}</div>
                <div class="tooltip-connections">Celkem na úseku: ${segData.connections}</div>
                <div class="tooltip-destinations"><div style="font-size:11px; text-transform:uppercase; color:#64748b; margin-bottom:4px; letter-spacing:0.5px;">Přímá spojení</div>${destinationsHtml}</div>`;
    }

    // --- MOBILE MODALS ---
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

        let headerHtml = '';
        if (isSingle) {
            headerHtml = `<div class="modal-header" style="justify-content: flex-end;">
                            <button onclick="closeSegmentModal()" class="close-modal-btn">&times;</button>
                          </div>`;
        } else {
            headerHtml = `<div class="modal-header">
                            <button onclick="openSegmentModal('${segData.nodeA}', '${segData.nodeB}', window.currentSegmentLinesData)" class="modal-back-btn">← Zpět</button>
                            <button onclick="closeSegmentModal()" class="close-modal-btn">&times;</button>
                          </div>`;
        }

        let ttButton = `
            <div style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
                <button onclick="window.openTimetable('${segData.lineName}'); window.closeSegmentModal();" style="background: ${segData.color}; color: ${window.getContrastColor(segData.color)}; border: none; padding: 10px; border-radius: 6px; font-weight: 700; cursor: pointer; width: 100%; transition: opacity 0.2s;">Otevřít jízdní řád linky</button>
            </div>`;

        content.innerHTML = headerHtml + detailedHtml + ttButton;
        document.getElementById('segment-modal').style.display = 'flex';
    };

    window.closeSegmentModal = function() {
        document.getElementById('segment-modal').style.display = 'none';
    };

    window.routesData.forEach(route => {
        window.lineColorsDict[route.lineName] = route.color;
        if (route.changesTo) window.lineColorsDict[route.changesTo] = route.changeColor || route.color;

        route.connections = route.trainNames ? route.trainNames.length : 0;
        const firstStation = route.waypoints[0];
        const lastStation = route.waypoints[route.waypoints.length - 1];

        if (route.changeAt && route.changesTo) {
            const changeIndex = route.waypoints.indexOf(route.changeAt);
            if (changeIndex !== -1) {
                if (!window.lineEndpoints[route.lineName] || changeIndex + 1 > window.lineEndpoints[route.lineName].length) window.lineEndpoints[route.lineName] = { length: changeIndex + 1, start: firstStation, end: route.changeAt, color: route.color };
                if (!window.lineEndpoints[route.changesTo] || route.waypoints.length - changeIndex > window.lineEndpoints[route.changesTo].length) window.lineEndpoints[route.changesTo] = { length: route.waypoints.length - changeIndex, start: route.changeAt, end: lastStation, color: route.changeColor || route.color };
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

            let segmentRouteLabel = "";
            if (route.changesTo && route.changeAt) {
                if (!hasChanged) segmentRouteLabel = `${firstStation} ↔ ${route.changeAt} <span class="line-badge" style="background-color: ${route.changeColor}; color: ${window.getContrastColor(route.changeColor||'#fff')}; margin: 0 4px; padding: 1px 6px; font-size: 11px; pointer-events:none;">${route.changesTo}</span> ↔ ${lastStation}`;
                else segmentRouteLabel = `${firstStation} ↔ <span class="line-badge" style="background-color: ${route.color}; color: ${window.getContrastColor(route.color||'#fff')}; margin: 0 4px; padding: 1px 6px; font-size: 11px; pointer-events:none;">${route.lineName}</span> ${route.changeAt} ↔ ${lastStation}`;
            } else {
                const endA = firstStation < lastStation ? firstStation : lastStation;
                const endB = firstStation < lastStation ? lastStation : firstStation;
                segmentRouteLabel = `${endA} ↔ ${endB}`;
            }

            if (!stationLines[st1]) stationLines[st1] = new Set();
            if (!stationLines[st2]) stationLines[st2] = new Set();
            stationLines[st1].add(currentLineName);
            stationLines[st2].add(currentLineName);

            const isReversed = (window.stationsData[st1][1] > window.stationsData[st2][1]) || (window.stationsData[st1][1] === window.stationsData[st2][1] && window.stationsData[st1][0] > window.stationsData[st2][0]);
            const nodeA = isReversed ? st2 : st1;
            const nodeB = isReversed ? st1 : st2;
            const segmentKey = `${nodeA}---${nodeB}`;

            if (!segmentsMap[segmentKey]) segmentsMap[segmentKey] = {};
            if (!segmentsMap[segmentKey][currentLineName]) segmentsMap[segmentKey][currentLineName] = { lineName: currentLineName, connections: 0, color: currentColor, nodeA: nodeA, nodeB: nodeB, destinations: {} };

            segmentsMap[segmentKey][currentLineName].connections += route.connections;
            if (!segmentsMap[segmentKey][currentLineName].destinations[segmentRouteLabel]) segmentsMap[segmentKey][currentLineName].destinations[segmentRouteLabel] = { count: 0, trains: [] };
            segmentsMap[segmentKey][currentLineName].destinations[segmentRouteLabel].count += route.connections;
            if (route.trainNames) segmentsMap[segmentKey][currentLineName].destinations[segmentRouteLabel].trains.push(...route.trainNames);
        }
    });

    Object.entries(segmentsMap).forEach(([segKey, linesObj]) => {
        const linesOnSegment = Object.values(linesObj).sort((a, b) => a.lineName.localeCompare(b.lineName));
        let totalThickness = 0; const gap = 2;
        linesOnSegment.forEach(seg => { seg.thickness = (seg.connections * 0.22) + 2.5; totalThickness += seg.thickness; });
        totalThickness += (linesOnSegment.length - 1) * gap;
        let currentOffset = -totalThickness / 2;

        linesOnSegment.forEach((segData) => {
            const offset = currentOffset + (segData.thickness / 2);
            const latlngs = [ window.stationsData[segData.nodeA], window.stationsData[segData.nodeB] ];

            L.polyline(latlngs, { color: '#1a1a1a', weight: segData.thickness + 2.5, offset: offset, interactive: false }).addTo(map);
            L.polyline(latlngs, { color: segData.color, weight: segData.thickness, offset: offset, interactive: false }).addTo(map);

            const hitBoxWeight = window.isMobile ? Math.max(segData.thickness + 24, 30) : segData.thickness + 12;
            const interactionLine = L.polyline(latlngs, { color: '#000', weight: hitBoxWeight, opacity: 0, offset: offset }).addTo(map);

            const hoverHtml = window.generateLineTooltipHtml(segData, false);
            const clickHtml = window.generateLineTooltipHtml(segData, true); 

            if (!window.isMobile) {
                interactionLine.bindTooltip(hoverHtml, { sticky: true });
                interactionLine.bindPopup(clickHtml, { className: 'custom-popup' });

                interactionLine.on('popupopen', function() { this.closeTooltip(); this.unbindTooltip(); });
                interactionLine.on('popupclose', function() { this.bindTooltip(hoverHtml, { sticky: true }); });
            } else {
                // FIXED: Removed L.DomEvent.stopPropagation(e) that crashed mobile devices
                interactionLine.on('click', function() {
                    if (linesOnSegment.length === 1) {
                        window.currentSegmentLinesData = linesOnSegment;
                        window.showSegmentDetails(0, true);
                    } else {
                        window.openSegmentModal(segData.nodeA, segData.nodeB, linesOnSegment);
                    }
                });
            }

            currentOffset += segData.thickness + gap;
        });
    });

    for (const [name, coords] of Object.entries(window.stationsData)) {
        const passingLines = stationLines[name] ? Array.from(stationLines[name]).sort() : [];
        const isJunction = passingLines.length > 1;

        let rowsHtml = '';
        for (let i = 0; i < passingLines.length; i += 3) {
            const chunk = passingLines.slice(i, i + 3);
            const badgesHtml = chunk.map(line => {
                const bgColor = window.lineColorsDict[line] || '#cccccc';
                return `<span class="line-badge" style="background-color: ${bgColor}; color: ${window.getContrastColor(bgColor)}; margin: 2px; cursor: pointer;" onclick="window.openTimetable('${line}')">${line}</span>`;
            }).join('');
            rowsHtml += `<div style="display: flex; justify-content: center; width: 100%; margin-bottom: 2px;">${badgesHtml}</div>`;
        }

        const clickPopupHtml = `<div style="text-align: center; min-width: 120px; pointer-events: auto;">
                                <div style="font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;">${name}</div>
                                <div style="display: flex; flex-direction: column; align-items: center;">${rowsHtml}</div>
                                <div style="font-size: 10px; color: #94a3b8; margin-top: 8px;">Kliknutím na linku otevřete JŘ</div>
                             </div>`;

        const marker = L.circleMarker(coords, { radius: isJunction ? 5.5 : 3.5, fillColor: "#ffffff", color: "#1a1a1a", weight: isJunction ? 3 : 2, opacity: 1, fillOpacity: 1 }).addTo(map);
        
        marker.bindTooltip(name, { className: 'simple-station-tooltip', direction: 'top', offset: [0, isJunction ? -10 : -8] });
        marker.bindPopup(clickPopupHtml, { className: 'custom-popup station-popup' });
    }

    const legend = L.control({position: 'bottomleft'});
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        
        L.DomEvent.disableClickPropagation(div); 
        L.DomEvent.disableScrollPropagation(div);

        let html = `<div class="legend-title" id="legend-toggle"><span>Linky a konečné stanice</span><span class="legend-toggle-icon">▼</span></div><div class="legend-content" id="legend-content">`;

        Object.keys(window.lineEndpoints).sort().forEach(line => {
            const data = window.lineEndpoints[line];
            const endA = data.start < data.end ? data.start : data.end;
            const endB = data.start < data.end ? data.end : data.start;
            html += `<div class="legend-row">
                        <span class="line-badge" style="background-color: ${data.color}; color: ${window.getContrastColor(data.color)}; min-width: 32px; cursor: pointer;" onclick="window.openTimetable('${line}')">${line}</span>
                        <span class="legend-stops">${endA} ↔ ${endB}</span>
                     </div>`;
        });
        
        div.innerHTML = html + '</div>';
        
        setTimeout(() => {
            const toggleBtn = div.querySelector('#legend-toggle');
            const contentDiv = div.querySelector('#legend-content');
            L.DomEvent.on(toggleBtn, 'click', function(e) {
                L.DomEvent.stopPropagation(e);
                toggleBtn.classList.toggle('collapsed');
                contentDiv.classList.toggle('collapsed');
            });
        }, 0);
        return div;
    };
    legend.addTo(map);
}
