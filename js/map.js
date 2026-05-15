window.initializeMap = function() {
    // Pole pro ukládání čar, abychom jim mohli měnit offset při zoomování
    window.mapOffsetLines = [];

    // 1. SELF-HEALING CHECK: If the map div is missing, create it automatically
    let mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.warn("Map container was missing from HTML! Auto-creating it.");
        mapDiv = document.createElement('div');
        mapDiv.id = 'map';
        document.body.insertBefore(mapDiv, document.body.firstChild);
    }

    // 2. CLEANUP: Destroy ghost maps
    if (window.map && typeof window.map.remove === 'function' && window.map._leaflet_id) {
        window.map.off();
        window.map.remove();
    }
    window.map = null; 

    // 3. Initialize the map safely
    const map = L.map('map').setView([49.4, 15.6], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);
    window.map = map;

    // --- LOGIKA SEGMENTŮ (Tloušťka a Offset) ---
    const segmentStats = {};
    window.routesData.forEach(route => {
        if (!route.waypoints) return;
        for (let i = 0; i < route.waypoints.length - 1; i++) {
            const st1 = route.waypoints[i];
            const st2 = route.waypoints[i+1];
            const segId = [st1, st2].sort().join('|');
            
            if (!segmentStats[segId]) {
                segmentStats[segId] = { lines: new Set(), connections: 0, nodeA: st1, nodeB: st2 };
            }
            segmentStats[segId].lines.add(route.lineName);
            if (route.trainNames) {
                segmentStats[segId].connections += route.trainNames.length;
            }
        }
    });

    const stationLines = {};

    Object.keys(segmentStats).forEach(segId => {
        const seg = segmentStats[segId];
        const nodeA = seg.nodeA;
        const nodeB = seg.nodeB;

        if (!window.stationsData[nodeA] || !window.stationsData[nodeB]) return;

        stationLines[nodeA] = true;
        stationLines[nodeB] = true;

        // Původní logika tloušťky
        seg.thickness = (seg.connections * 0.22) + 2.5;
        if (seg.thickness > 12) seg.thickness = 12;

        const linesOnSegment = [];
        const sortedLines = Array.from(seg.lines).sort();
        
        sortedLines.forEach((lineName, index) => {
            let offset = 0;
            if (index > 0) {
                const step = Math.ceil(index / 2);
                offset = (index % 2 === 1) ? step * 6 : step * -6;
            }
            linesOnSegment.push({ lineName, offset, nodeA, nodeB });
        });

        // Výpočet aktuálního zoom faktoru pro offset
        let z = map.getZoom();
        let zoomFactor = z >= 11 ? 1 : (z === 10 ? 0.6 : (z === 9 ? 0.3 : 0));

        linesOnSegment.forEach((segData) => {
            const route = window.routesData.find(r => r.lineName === segData.lineName);
            const routeColor = route ? route.color : '#3388ff';
            
            // --- GEOMETRIE TRATI (BRouter) ---
            let latlngs;
            let trackKey = [segData.nodeA, segData.nodeB].sort().join('|');

            if (window.tracksData && window.tracksData[trackKey]) {
                latlngs = JSON.parse(JSON.stringify(window.tracksData[trackKey]));
                // Synchronizace směru pro správný polylineOffset
                if (segData.nodeA > segData.nodeB) {
                    latlngs.reverse();
                }
            } else {
                latlngs = [ window.stationsData[segData.nodeA], window.stationsData[segData.nodeB] ];
            }

            const currentOffset = segData.offset * zoomFactor;

            // 1. Background line (černé olemování)
            const bgLine = L.polylineOffset(latlngs, {
                color: '#000000',
                weight: seg.thickness + 2.5,
                opacity: 0.8,
                offset: currentOffset,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);

            // 2. Visible color line (středová barevná čára)
            const mainLine = L.polylineOffset(latlngs, {
                color: routeColor,
                weight: seg.thickness,
                opacity: 1,
                offset: currentOffset,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);

            // 3. Transparent Click Hitbox
            const clickLine = L.polylineOffset(latlngs, {
                color: 'transparent',
                weight: Math.max(seg.thickness + 10, 20),
                opacity: 0,
                offset: currentOffset,
                lineJoin: 'round',
                lineCap: 'round',
                cursor: 'pointer'
            }).addTo(map);

            // Uložíme čáry pro dynamický zoom (budeme měnit offset jen u nich)
            bgLine.baseOffset = segData.offset;
            mainLine.baseOffset = segData.offset;
            clickLine.baseOffset = segData.offset;
            window.mapOffsetLines.push(bgLine, mainLine, clickLine);

            // Tooltip a Interakce
            const tooltipContent = `
                <div style="text-align:center;">
                    <span class="line-badge" style="background-color:${routeColor}; color:${window.getContrastColor(routeColor)};">
                        ${segData.lineName}
                    </span>
                    <div style="margin-top:5px; font-size:11px; color:#94a3b8;">
                        ${segData.nodeA} ↔ ${segData.nodeB}
                    </div>
                </div>
            `;
            clickLine.bindTooltip(tooltipContent, { sticky: true, className: 'custom-tooltip' });

            clickLine.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (window.isMobile) {
                    window.showMobileSegmentOptions(segId, seg.lines, routeColor);
                } else {
                    window.openTimetable(segData.lineName);
                }
            });

            clickLine.on('mouseover', () => {
                mainLine.setStyle({ weight: seg.thickness + 2 });
                bgLine.setStyle({ weight: seg.thickness + 4.5 });
            });
            clickLine.on('mouseout', () => {
                mainLine.setStyle({ weight: seg.thickness });
                bgLine.setStyle({ weight: seg.thickness + 2.5 });
            });
        });
    });

    // --- VYKRESLENÍ STANIC ---
    for (let station in window.stationsData) {
        if (stationLines[station]) {
            L.circleMarker(window.stationsData[station], {
                radius: 4.5,
                fillColor: '#1e293b',
                color: '#38bdf8',
                weight: 2,
                opacity: 1,
                fillOpacity: 1,
                pane: 'markerPane'
            }).addTo(map)
              .bindTooltip(station, { direction: 'top', offset: [0, -10], className: 'station-tooltip' })
              .on('click', (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (typeof window.showStationDepartures === 'function') {
                      window.showStationDepartures(station);
                  }
              });
        }
    }

    // --- DYNAMICKÝ OFFSET PODLE ZOOMU ---
    map.on('zoomend', function() {
        let currentZoom = map.getZoom();
        let factor = currentZoom >= 11 ? 1 : (currentZoom === 10 ? 0.6 : (currentZoom === 9 ? 0.3 : 0));
        
        window.mapOffsetLines.forEach(line => {
            if (typeof line.setOffset === 'function') {
                line.setOffset(line.baseOffset * factor);
            }
        });
    });

    // --- RESTART LEGENDY ---
    const oldLegend = document.querySelector('.map-legend');
    if (oldLegend) oldLegend.remove();

    const legend = L.control({position: 'bottomleft'});
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        // Shromáždění unikátních linek pro legendu
        const linesForLegend = {};
        window.routesData.forEach(r => {
            if (!linesForLegend[r.lineName]) {
                linesForLegend[r.lineName] = {
                    name: r.lineName,
                    color: r.color,
                    start: r.waypoints[0],
                    end: r.waypoints[r.waypoints.length-1]
                };
            }
        });

        let html = `<div class="legend-title" id="legend-toggle"><span>Linky a trasy</span><span class="legend-toggle-icon">▼</span></div><div class="legend-content" id="legend-content">`;
        Object.keys(linesForLegend).sort().forEach(lName => {
            const l = linesForLegend[lName];
            html += `<div class="legend-row">
                        <span class="line-badge" style="background-color: ${l.color}; color: ${window.getContrastColor(l.color)}; min-width: 35px; cursor: pointer;" onclick="window.openTimetable('${l.name}')">${l.name}</span>
                        <span class="legend-stops">${l.start} ↔ ${l.end}</span>
                     </div>`;
        });
        html += '</div>';
        div.innerHTML = html;

        setTimeout(() => {
            const toggle = div.querySelector('#legend-toggle');
            const content = div.querySelector('#legend-content');
            if (toggle && content) {
                toggle.addEventListener('click', () => {
                    toggle.classList.toggle('collapsed');
                    content.style.display = toggle.classList.contains('collapsed') ? 'none' : 'block';
                });
            }
        }, 100);

        return div;
    };
    legend.addTo(map);
};
