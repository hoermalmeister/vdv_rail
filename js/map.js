window.initializeMap = function() {
    // 1. SELF-HEALING CHECK: If the map div is missing, create it automatically
    let mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.warn("Map container was missing from HTML! Auto-creating it.");
        mapDiv = document.createElement('div');
        mapDiv.id = 'map';
        // Put it at the very top of the body
        document.body.insertBefore(mapDiv, document.body.firstChild);
    }

    // 2. CLEANUP: Destroy any ghost maps from Live Server refreshing
    if (window.map != undefined) {
        window.map.off();
        window.map.remove();
        window.map = null;
    }

    // 3. Initialize the map safely
    const map = L.map('map').setView([49.4, 15.6], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);
    window.map = map;

    const segmentsMap = {};
    const stationLines = {};
    
    window.routesData.forEach(route => {
        if (route.color && !window.lineColorsDict[route.lineName]) window.lineColorsDict[route.lineName] = route.color;
    });
    window.routesData.forEach(route => {
        if (route.changesTo && !window.lineColorsDict[route.changesTo]) window.lineColorsDict[route.changesTo] = route.changeColor || route.color;
    });

    window.generateTooltipHtml = function(segData, isClick = false) {
        let destinationsHtml = "";
        for (const [routeLabel, data] of Object.entries(segData.destinations)) {
            const uniqueTrains = [...new Set(data.trains)].sort();
            
            let trainsHtml = "";
            if (isClick) {
                let clickableTrains = uniqueTrains.map(t => `<span onclick="window.openSingleTrain('${t}'); event.stopPropagation();" style="cursor: pointer; white-space: nowrap;">${t}</span>`).join(', ');
                trainsHtml = `<div class="dest-trains">${clickableTrains}</div>`;
            }
            
            destinationsHtml += `<div class="dest-group"><div class="dest-row"><span>${routeLabel}</span><span class="dest-right"><span class="dest-count">${data.count}</span></span></div>${trainsHtml}</div>`;
        }
        const badgeTextColor = window.getContrastColor(segData.color);
        
        const pointerStyle = isClick ? 'cursor: pointer;' : 'pointer-events: none;';
        const clickAttr = isClick ? `onclick="window.openTimetable('${segData.lineName}')"` : '';
        
        return `<div class="tooltip-header"><span class="line-badge" style="background-color: ${segData.color}; color: ${badgeTextColor}; ${pointerStyle}" ${clickAttr}>${segData.lineName}</span></div>
                <div class="tooltip-segment">${segData.nodeA} ↔ ${segData.nodeB}</div>
                <div class="tooltip-connections">Celkem na úseku: ${segData.connections}</div>
                <div class="tooltip-destinations"><div style="font-size:11px; text-transform:uppercase; color:#64748b; margin-bottom:4px; letter-spacing:0.5px;">Přímá spojení</div>${destinationsHtml}</div>`;
    };

    window.openMobileModal = function(nodeA, nodeB, linesOnSegment) {
        const modal = document.getElementById('mobile-modal');
        const content = document.getElementById('mobile-modal-content');

        let buttonsHtml = linesOnSegment.map((seg, idx) => {
            const textColor = window.getContrastColor(seg.color);
            let endpointsText = "Zobrazit spojení...";
            if (window.lineEndpoints[seg.lineName]) {
                const data = window.lineEndpoints[seg.lineName];
                const endA = data.start < data.end ? data.start : data.end;
                const endB = data.start < data.end ? data.end : data.start;
                endpointsText = `${endA} ↔ ${endB}`;
            }
            return `<button class="modal-line-btn" onclick="window.showMobileDetails(${idx})">
                        <span class="line-badge" style="background-color: ${seg.color}; color: ${textColor}; min-width:35px;">${seg.lineName}</span>
                        <span class="btn-text" style="font-weight: 600;">${endpointsText}</span>
                    </button>`;
        }).join('');

        content.innerHTML = `<div class="modal-header"><h3>${nodeA} ↔ ${nodeB}</h3><button onclick="window.closeModal()" class="close-btn">&times;</button></div>
                             <p style="color: #94a3b8; font-size: 13px; margin-bottom: 16px;">Na tomto úseku jezdí více linek. Kterou chcete zobrazit?</p>
                             <div class="modal-line-list">${buttonsHtml}</div>`;
        window.currentSegmentLinesData = linesOnSegment;
        modal.style.display = 'flex';
    };

    window.showMobileDetails = function(idx, isSingle = false) {
        const segData = window.currentSegmentLinesData[idx];
        const content = document.getElementById('mobile-modal-content');
        const detailedHtml = window.generateTooltipHtml(segData, true);

        let headerHtml = isSingle 
            ? `<div class="modal-header" style="justify-content: flex-end;"><button onclick="window.closeModal()" class="close-btn">&times;</button></div>` 
            : `<div class="modal-header"><button onclick="window.openMobileModal('${segData.nodeA}', '${segData.nodeB}', window.currentSegmentLinesData)" class="back-btn">← Zpět</button><button onclick="window.closeModal()" class="close-btn">&times;</button></div>`;

        content.innerHTML = headerHtml + detailedHtml;
        document.getElementById('mobile-modal').style.display = 'flex';
    };

    window.closeModal = function() { document.getElementById('mobile-modal').style.display = 'none'; };

    window.routesData.forEach(route => {
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
                if (!hasChanged) segmentRouteLabel = `${firstStation} ↔ ${route.changeAt} <span class="line-badge" style="background-color: ${route.changeColor}; color: ${window.getContrastColor(route.changeColor||'#fff')}; margin: 0 4px; padding: 1px 6px; font-size: 11px;">${route.changesTo}</span> ↔ ${lastStation}`;
                else segmentRouteLabel = `${firstStation} ↔ <span class="line-badge" style="background-color: ${route.color}; color: ${window.getContrastColor(route.color||'#fff')}; margin: 0 4px; padding: 1px 6px; font-size: 11px;">${route.lineName}</span> ${route.changeAt} ↔ ${lastStation}`;
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

            L.polyline(latlngs, { color: '#1a1a1a', weight: segData.thickness + 2.5, opacity: 1, lineCap: 'round', lineJoin: 'round', offset: offset, interactive: false }).addTo(map);
            L.polyline(latlngs, { color: segData.color, weight: segData.thickness, opacity: 1, lineCap: 'round', lineJoin: 'round', offset: offset, interactive: false }).addTo(map);

            const hitBoxWeight = window.isMobile ? Math.max(segData.thickness + 24, 30) : segData.thickness + 12;
            const interactionLine = L.polyline(latlngs, { color: 'transparent', weight: hitBoxWeight, opacity: 0, lineCap: 'round', lineJoin: 'round', offset: offset }).addTo(map);

            const tooltipContentHover = window.generateTooltipHtml(segData, false);
            const tooltipContentClick = window.generateTooltipHtml(segData, true);

            if (!window.isMobile) {
                interactionLine.bindTooltip(tooltipContentHover, { sticky: true });
                interactionLine.bindPopup(tooltipContentClick, { className: 'custom-popup' });
                interactionLine.on('popupopen', function() { this.closeTooltip(); this.unbindTooltip(); });
                interactionLine.on('popupclose', function() { this.bindTooltip(tooltipContentHover, { sticky: true }); });
            } else {
                interactionLine.on('click', function() {
                    if (linesOnSegment.length === 1) {
                        window.currentSegmentLinesData = linesOnSegment;
                        window.showMobileDetails(0, true);
                    } else {
                        window.openMobileModal(segData.nodeA, segData.nodeB, linesOnSegment);
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

        const tooltipHtml = `<div style="text-align: center; min-width: 80px;"><div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">${name}</div></div>`;
        const clickPopupHtml = `<div style="text-align: center; min-width: 120px; pointer-events: auto;"><div style="font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;">${name}</div><div style="display: flex; flex-direction: column; align-items: center;">${rowsHtml}</div><div style="font-size: 10px; color: #94a3b8; margin-top: 8px;">Kliknutím na linku otevřete JŘ</div></div>`;

        const marker = L.circleMarker(coords, { 
            radius: isJunction ? 5.5 : 3.5, 
            fillColor: "#ffffff", 
            color: "#1a1a1a", 
            weight: isJunction ? 3 : 2, 
            opacity: 1, 
            fillOpacity: 1,
            interactive: !window.isMobile 
        }).addTo(map);

        let interactiveMarker = marker;

        if (window.isMobile) {
            interactiveMarker = L.circleMarker(coords, { radius: 25, color: 'transparent', fillColor: 'transparent', interactive: true }).addTo(map);
            interactiveMarker.bringToFront();
        }

        if (!window.isMobile) {
            marker.bindTooltip(tooltipHtml, { className: 'station-tooltip', direction: 'top', offset: [0, isJunction ? -10 : -8] });
        }
        
        interactiveMarker.bindPopup(clickPopupHtml, { className: 'custom-popup station-popup' });
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
            html += `<div class="legend-row"><span class="line-badge" style="background-color: ${data.color}; color: ${window.getContrastColor(data.color)}; min-width: 32px; cursor: pointer;" onclick="window.openTimetable('${line}')">${line}</span><span class="legend-stops">${endA} ↔ ${endB}</span></div>`;
        });
        html += '</div>';
        div.innerHTML = html;

        setTimeout(() => {
            const titleBtn = div.querySelector('#legend-toggle');
            const contentDiv = div.querySelector('#legend-content');
            titleBtn.addEventListener('click', () => {
                titleBtn.classList.toggle('collapsed');
                contentDiv.classList.toggle('collapsed');
            });
        }, 0);
        return div;
    };
    legend.addTo(map);
};
