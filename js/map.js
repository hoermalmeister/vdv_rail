window.initializeMap = function() {
    let mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.warn("Map container was missing from HTML! Auto-creating it.");
        mapDiv = document.createElement('div');
        mapDiv.id = 'map';
        document.body.insertBefore(mapDiv, document.body.firstChild);
    }

    if (window.map && typeof window.map.remove === 'function' && window.map._leaflet_id) {
        window.map.off();
        window.map.remove();
    }
    window.map = null; 

    const map = L.map('map').setView([49.4, 15.6], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);
    window.map = map;

    const segmentsMap = {};
    const stationLines = {};
    
    window.routesData.forEach(route => {
        if (route.color && !window.lineColorsDict[route.lineName]) {
            window.lineColorsDict[route.lineName] = route.color;
        }
        if (route.waypoints && route.waypoints.length > 1) {
            let start = route.waypoints[0];
            let end = route.waypoints[route.waypoints.length - 1];
            let lineName = route.lineName;
            let routeColor = route.color || '#3388ff';

            if (!window.lineEndpoints[lineName]) {
                window.lineEndpoints[lineName] = { start: start, end: end, color: routeColor };
            }

            for (let j = 0; j < route.waypoints.length - 1; j++) {
                let st1 = route.waypoints[j];
                let st2 = route.waypoints[j + 1];
                let pt1 = window.stationsData[st1];
                let pt2 = window.stationsData[st2];

                if (pt1 && pt2) {
                    // Evidujeme si linky pro každou stanici (kvůli kreslení bodů)
                    if (!stationLines[st1]) stationLines[st1] = new Set();
                    if (!stationLines[st2]) stationLines[st2] = new Set();
                    stationLines[st1].add(lineName);
                    stationLines[st2].add(lineName);

                    let segmentId = [st1, st2].sort().join('-');
                    if (!segmentsMap[segmentId]) segmentsMap[segmentId] = [];
                    
                    let lineOffset = segmentsMap[segmentId].length;
                    segmentsMap[segmentId].push(lineName);

                    // --- ZDE JE KOUZLO S GEOMETRIÍ TRATI ---
                    let latlngs;
                    let trackKey = [st1, st2].sort().join('|');

                    if (window.tracksData && window.tracksData[trackKey]) {
                        latlngs = JSON.parse(JSON.stringify(window.tracksData[trackKey]));
                        // Pokud jdeme "proti srsti", otočíme směr, ať se linky nekříží
                        if (st1 > st2) {
                            latlngs.reverse();
                        }
                    } else {
                        latlngs = [pt1, pt2]; // Záloha (rovná čára)
                    }

                    // Vykreslení
                    if (typeof L.polylineOffset === 'function') {
                        L.polylineOffset(latlngs, {
                            color: routeColor,
                            weight: 4,
                            opacity: 0.9,
                            offset: lineOffset * 6, // Posun linek vedle sebe
                            lineJoin: 'round',
                            lineCap: 'round'
                        }).addTo(map).bindTooltip(`<b>${lineName}</b>`, { className: 'custom-tooltip', sticky: true });
                    } else {
                        L.polyline(latlngs, {
                            color: routeColor,
                            weight: 4,
                            opacity: 0.9,
                            lineJoin: 'round',
                            lineCap: 'round'
                        }).addTo(map).bindTooltip(`<b>${lineName}</b>`, { className: 'custom-tooltip', sticky: true });
                    }
                }
            }
        }
    });

    // Vykreslení stanic jako bodů
    for (let station in window.stationsData) {
        if (stationLines[station]) {
            let coords = window.stationsData[station];
            let isJunction = stationLines[station].size > 1;
            
            let markerColor = isJunction ? '#ffffff' : '#1e293b';
            let markerRadius = isJunction ? 6 : 4;
            let markerWeight = isJunction ? 3 : 2;

            L.circleMarker(coords, {
                radius: markerRadius,
                fillColor: markerColor,
                color: '#38bdf8',
                weight: markerWeight,
                opacity: 1,
                fillOpacity: 1
            }).addTo(map)
              .bindTooltip(station, { direction: 'top', offset: [0, -10], className: 'station-tooltip' })
              .on('click', () => {
                  if (typeof window.showStationDepartures === 'function') {
                      window.showStationDepartures(station);
                  }
              });
        }
    }

    // Přidání legendy
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
                contentDiv.style.display = titleBtn.classList.contains('collapsed') ? 'none' : 'block';
            });
        }, 100);

        return div;
    };
    legend.addTo(map);
};
