window.initializeMap = function() {
    window.mapOffsetLines = []; // Pole pro dynamickou změnu rozestupů

    // Základní inicializace mapy
    const map = L.map('map').setView([49.4, 15.6], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);
    window.map = map;

    const segmentStats = {};
    const stationLines = {};

    // 1. Výpočet statistik segmentů (přesně podle vaší původní logiky)
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

    // 2. Vykreslení linek
    Object.keys(segmentStats).forEach(segId => {
        const seg = segmentStats[segId];
        if (!window.stationsData[seg.nodeA] || !window.stationsData[seg.nodeB]) return;

        stationLines[seg.nodeA] = true;
        stationLines[seg.nodeB] = true;

        // Vaše původní tloušťka
        seg.thickness = (seg.connections * 0.22) + 2.5;
        if (seg.thickness > 12) seg.thickness = 12;

        const sortedLines = Array.from(seg.lines).sort();
        
        // Výpočet faktoru pro rozestupy (zoom 11+ = plné, zoom 9 = minimální)
        let z = map.getZoom();
        let zoomFactor = z >= 11 ? 1 : (z === 10 ? 0.5 : (z === 9 ? 0.2 : 0));

        sortedLines.forEach((lineName, index) => {
            const route = window.routesData.find(r => r.lineName === lineName);
            const routeColor = route ? route.color : '#3388ff';
            
            // Výpočet odsazení
            let baseOffset = 0;
            if (index > 0) {
                const step = Math.ceil(index / 2);
                baseOffset = (index % 2 === 1) ? step * 6 : step * -6;
            }

            // --- GEOMETRIE (Křivka vs Přímka) ---
            let latlngs;
            let trackKey = [seg.nodeA, seg.nodeB].sort().join('|');
            if (window.tracksData && window.tracksData[trackKey]) {
                latlngs = JSON.parse(JSON.stringify(window.tracksData[trackKey]));
                if (seg.nodeA > seg.nodeB) latlngs.reverse();
            } else {
                latlngs = [ window.stationsData[seg.nodeA], window.stationsData[seg.nodeB] ];
            }

            const currentOffset = baseOffset * zoomFactor;

            // Vykreslení vrstev (Lemování -> Barva -> Hitbox)
            const bg = L.polylineOffset(latlngs, { color: '#000000', weight: seg.thickness + 2.5, offset: currentOffset, lineJoin: 'round' }).addTo(map);
            const main = L.polylineOffset(latlngs, { color: routeColor, weight: seg.thickness, offset: currentOffset, lineJoin: 'round' }).addTo(map);
            const click = L.polylineOffset(latlngs, { color: 'transparent', weight: 20, offset: currentOffset, cursor: 'pointer' }).addTo(map);

            // Uložení pro dynamický zoom
            bg.baseOffset = baseOffset; main.baseOffset = baseOffset; click.baseOffset = baseOffset;
            window.mapOffsetLines.push(bg, main, click);

            // Interakce
            click.bindTooltip(`<b>${lineName}</b><br>${seg.nodeA} ↔ ${seg.nodeB}`, { sticky: true, className: 'custom-tooltip' });
            click.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (window.isMobile) window.showMobileSegmentOptions(segId, seg.lines, routeColor);
                else window.openTimetable(lineName);
            });
        });
    });

    // 3. Vykreslení stanic (Vaše původní ikony)
    for (let station in window.stationsData) {
        if (stationLines[station]) {
            L.circleMarker(window.stationsData[station], {
                radius: 4.5,
                fillColor: '#1e293b',
                color: '#38bdf8',
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            }).addTo(map)
              .bindTooltip(station, { direction: 'top', offset: [0, -10], className: 'station-tooltip' })
              .on('click', (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (typeof window.showStationDepartures === 'function') window.showStationDepartures(station);
              });
        }
    }

    // 4. POSLUCHAČ ZOOMU (Oprava koleček/smyček)
    map.on('zoomend', function() {
        let factor = map.getZoom() >= 11 ? 1 : (map.getZoom() === 10 ? 0.5 : (map.getZoom() === 9 ? 0.2 : 0));
        window.mapOffsetLines.forEach(line => {
            if (line.setOffset) line.setOffset(line.baseOffset * factor);
        });
    });

    // Legenda (Zjednodušená verze)
    const legend = L.control({position: 'bottomleft'});
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        div.innerHTML = '<div class="legend-title">Linky VDV</div><div id="legend-content"></div>';
        // ... (zde můžete nechat svůj kód pro obsah legendy)
        return div;
    };
    legend.addTo(map);
};
