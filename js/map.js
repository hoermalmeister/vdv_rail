window.initializeMap = function() {
    // Pole pro dynamickou úpravu rozestupů při zoomování
    window.mapOffsetLines = [];

    // 1. Kontrola kontejneru
    let mapDiv = document.getElementById('map');
    if (!mapDiv) {
        mapDiv = document.createElement('div');
        mapDiv.id = 'map';
        document.body.insertBefore(mapDiv, document.body.firstChild);
    }

    // 2. Úklid staré mapy
    if (window.map && typeof window.map.remove === 'function' && window.map._leaflet_id) {
        window.map.off();
        window.map.remove();
    }
    window.map = null; 

    // 3. Inicializace mapy
    const map = L.map('map').setView([49.4, 15.6], 9);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);
    window.map = map;

    const segmentsMap = {};
    const stationLines = {};
    
    // --- TVOJE PŮVODNÍ LOGIKA SEGMENTŮ A TLOUŠŤKY ---
    window.routesData.forEach(route => {
        if (route.color && !window.lineColorsDict[route.lineName]) {
            window.lineColorsDict[route.lineName] = route.color;
        }

        if (route.waypoints && route.waypoints.length > 1) {
            let lineName = route.lineName;
            let routeColor = route.color || '#3388ff';
            let connections = route.trainNames ? route.trainNames.length : 0;
            
            // Tloušťka podle tvého vzorce
            const thickness = (connections * 0.22) + 2.5;
            const finalThickness = thickness > 12 ? 12 : thickness;

            for (let j = 0; j < route.waypoints.length - 1; j++) {
                let st1 = route.waypoints[j];
                let st2 = route.waypoints[j + 1];
                let pt1 = window.stationsData[st1];
                let pt2 = window.stationsData[st2];

                if (pt1 && pt2) {
                    if (!stationLines[st1]) stationLines[st1] = new Set();
                    if (!stationLines[st2]) stationLines[st2] = new Set();
                    stationLines[st1].add(lineName);
                    stationLines[st2].add(lineName);

                    let segmentId = [st1, st2].sort().join('-');
                    if (!segmentsMap[segmentId]) segmentsMap[segmentId] = [];
                    
                    let lineOffsetIndex = segmentsMap[segmentId].length;
                    segmentsMap[segmentId].push(lineName);

                    // Výpočet odsazení (střídavě vlevo/vpravo)
                    let baseOffset = 0;
                    if (lineOffsetIndex > 0) {
                        const step = Math.ceil(lineOffsetIndex / 2);
                        baseOffset = (lineOffsetIndex % 2 === 1) ? step * 7 : step * -7;
                    }

                    // --- GEOMETRIE TRATI (BRouter) ---
                    let latlngs;
                    let trackKey = [st1, st2].sort().join('|');

                    if (window.tracksData && window.tracksData[trackKey]) {
                        latlngs = JSON.parse(JSON.stringify(window.tracksData[trackKey]));
                        // Otočení směru, aby offset seděl a linky se nekřížily
                        if (st1 > st2) latlngs.reverse();
                    } else {
                        latlngs = [pt1, pt2];
                    }

                    // Dynamický faktor pro zoom (proti smyčkám)
                    let z = map.getZoom();
                    let zoomFactor = z >= 11 ? 1 : (z === 10 ? 0.5 : (z === 9 ? 0.2 : 0));
                    let currentOffset = baseOffset * zoomFactor;

                    // --- TVOJE TŘI VRSTVY (Black, Color, Hitbox) ---
                    
                    // 1. Černé pozadí
                    const bgLine = L.polylineOffset(latlngs, {
                        color: '#000000',
                        weight: finalThickness + 2.5,
                        opacity: 0.8,
                        offset: currentOffset,
                        lineJoin: 'round',
                        lineCap: 'round'
                    }).addTo(map);

                    // 2. Viditelná čára
                    const mainLine = L.polylineOffset(latlngs, {
                        color: routeColor,
                        weight: finalThickness,
                        opacity: 1,
                        offset: currentOffset,
                        lineJoin: 'round',
                        lineCap: 'round'
                    }).addTo(map);

                    // 3. Hitbox pro klikání
                    const clickLine = L.polylineOffset(latlngs, {
                        color: 'transparent',
                        weight: Math.max(finalThickness + 10, 20),
                        opacity: 0,
                        offset: currentOffset,
                        lineJoin: 'round',
                        lineCap: 'round',
                        cursor: 'pointer'
                    }).addTo(map);

                    // Uložení pro zoomend event
                    bgLine.baseOffset = baseOffset;
                    mainLine.baseOffset = baseOffset;
                    clickLine.baseOffset = baseOffset;
                    window.mapOffsetLines.push(bgLine, mainLine, clickLine);

                    // Tooltipy a Interakce (tvoje původní)
                    clickLine.bindTooltip(`<b>${lineName}</b>`, { className: 'custom-tooltip', sticky: true });
                    
                    clickLine.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        if (window.isMobile) {
                            window.showMobileSegmentOptions(segmentId, new Set(segmentsMap[segmentId]), routeColor);
                        } else {
                            window.openTimetable(lineName);
                        }
                    });

                    clickLine.on('mouseover', () => {
                        mainLine.setStyle({ weight: finalThickness + 2 });
                        bgLine.setStyle({ weight: finalThickness + 4.5 });
                    });
                    clickLine.on('mouseout', () => {
                        mainLine.setStyle({ weight: finalThickness });
                        bgLine.setStyle({ weight: finalThickness + 2.5 });
                    });
                }
            }
        }
    });

    // --- TVOJE PŮVODNÍ IKONY STANIC ---
    for (let station in window.stationsData) {
        if (stationLines[station]) {
            let coords = window.stationsData[station];
            L.circleMarker(coords, {
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
                  if (typeof window.showStationDepartures === 'function') {
                      window.showStationDepartures(station);
                  }
              });
        }
    }

    // --- DYNAMICKÝ OFFSET PŘI ZOOMU ---
    map.on('zoomend', function() {
        let z = map.getZoom();
        let factor = z >= 11 ? 1 : (z === 10 ? 0.5 : (z === 9 ? 0.2 : 0));
        window.mapOffsetLines.forEach(line => {
            if (line.setOffset) line.setOffset(line.baseOffset * factor);
        });
    });

    // --- TVOJE PŮVODNÍ LEGENDA (Snippet) ---
    const legend = L.control({position: 'bottomleft'});
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-legend');
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        // Zjednodušená příprava pro legendu
        let html = `<div class="legend-title" id="legend-toggle"><span>Linky a konečné stanice</span><span class="legend-toggle-icon">▼</span></div><div class="legend-content" id="legend-content">`;
        
        // Sesbíráme linky z routesData pro legendu
        const legendLines = {};
        window.routesData.forEach(r => {
            if (!legendLines[r.lineName]) {
                legendLines[r.lineName] = { color: r.color, start: r.waypoints[0], end: r.waypoints[r.waypoints.length-1] };
            }
        });

        Object.keys(legendLines).sort().forEach(line => {
            const data = legendLines[line];
            html += `<div class="legend-row">
                <span class="line-badge" style="background-color: ${data.color}; color: ${window.getContrastColor(data.color)}; min-width: 32px; cursor: pointer;" onclick="window.openTimetable('${line}')">${line}</span>
                <span class="legend-stops">${data.start} ↔ ${data.end}</span>
            </div>`;
        });
        html += '</div>';
        div.innerHTML = html;

        setTimeout(() => {
            const titleBtn = div.querySelector('#legend-toggle');
            const contentDiv = div.querySelector('#legend-content');
            if (titleBtn && contentDiv) {
                titleBtn.addEventListener('click', () => {
                    titleBtn.classList.toggle('collapsed');
                    contentDiv.style.display = titleBtn.classList.contains('collapsed') ? 'none' : 'block';
                });
            }
        }, 100);

        return div;
    };
    legend.addTo(map);
};
