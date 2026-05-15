window.initializeMap = function() {
    let mapDiv = document.getElementById('map');
    if (!mapDiv) {
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

    const stationLines = {};
    
    // --- VÝPOČET GLOBÁLNÍCH PRUHŮ PRO LINKY ---
    // Aby se rychlíky a osobáky na reálné trati nepřekrývaly, každá linka dostane svůj fixní posun
    let allLines = [...new Set(window.routesData.map(r => r.lineName))].sort();
    let lineOffsets = {};
    allLines.forEach((line, idx) => {
        let sign = idx % 2 === 0 ? 1 : -1;
        let step = Math.ceil(idx / 2);
        lineOffsets[line] = sign * step; // Tvoří sekvenci: 0, 1, -1, 2, -2, 3, -3...
    });

    window.routesData.forEach(route => {
        if (route.color && !window.lineColorsDict[route.lineName]) {
            window.lineColorsDict[route.lineName] = route.color;
        }
        
        if (route.waypoints && route.waypoints.length > 1) {
            let start = route.waypoints[0];
            let end = route.waypoints[route.waypoints.length - 1];
            let lineName = route.lineName;
            let routeColor = route.color || '#3388ff';
            let globalOffset = lineOffsets[lineName] * 5; // Každá linka je posunuta o 5px od středu

            if (!window.lineEndpoints[lineName]) {
                window.lineEndpoints[lineName] = { start: start, end: end, color: routeColor };
            }

            for (let j = 0; j < route.waypoints.length - 1; j++) {
                let st1 = route.waypoints[j];
                let st2 = route.waypoints[j + 1];
                let pt1 = window.stationsData[st1];
                let pt2 = window.stationsData[st2];

                if (pt1 && pt2) {
                    stationLines[st1] = true;
                    stationLines[st2] = true;

                    let latlngs;
                    let trackKey = [st1, st2].sort().join('|');

                    if (window.tracksData && window.tracksData[trackKey]) {
                        latlngs = JSON.parse(JSON.stringify(window.tracksData[trackKey]));
                    } else {
                        latlngs = [pt1, pt2]; // Záloha (rovná čára)
                    }

                    // --- ZAJIŠTĚNÍ KONZISTENTNÍHO SMĚRU ---
                    // Aby posun (offset) neposkakoval zleva doprava, donutíme geometrii jít vždy ze západu na východ
                    let firstPt = latlngs[0];
                    let lastPt = latlngs[latlngs.length - 1];
                    if (firstPt[1] > lastPt[1] || (firstPt[1] === lastPt[1] && firstPt[0] > lastPt[0])) {
                        latlngs.reverse();
                    }

                    // VYKRESLENÍ ČÁRY
                    let pl = L.polylineOffset(latlngs, {
                        color: routeColor,
                        weight: 4,
                        opacity: 0.9,
                        offset: globalOffset, 
                        lineJoin: 'round',
                        lineCap: 'round'
                    }).addTo(map);

                    // TOOLTIP a KLIKNUTÍ (Opraveno!)
                    pl.bindTooltip(`<b>${lineName}</b>`, { className: 'custom-tooltip', sticky: true });
                    
                    pl.on('click', () => {
                        if (typeof window.openTimetable === 'function') {
                            window.openTimetable(lineName);
                        }
                    });

                    // Vizuální odezva při najetí myší (usnadňuje klikání)
                    pl.on('mouseover', function() { this.setStyle({ weight: 7, opacity: 1 }); });
                    pl.on('mouseout', function() { this.setStyle({ weight: 4, opacity: 0.9 }); });
                }
            }
        }
    });

    // Vykreslení stanic jako jednotných bodů (Opraveno!)
    for (let station in window.stationsData) {
        if (stationLines[station]) {
            let coords = window.stationsData[station];

            L.circleMarker(coords, {
                radius: 4.5,
                fillColor: '#1e293b', // Jednotná barva pro všechny
                color: '#38bdf8',
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            }).addTo(map)
              .bindTooltip(station, { direction: 'top', offset: [0, -8], className: 'station-tooltip' });
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
