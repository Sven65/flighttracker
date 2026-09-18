(function () {
  var initialized = false;

  window.initFlightMap = function () {
    if (initialized) return;
    initialized = true;

    var container = document.getElementById('flight-map');
    if (!container) return;

    var routes = window.__FLIGHT_ROUTES__ || [];
    if (routes.length === 0) {
      container.innerHTML =
        '<p class="empty-state">No flights with a recognized airport yet — search for an airport ' +
        'when logging a flight and it\'ll show up here.</p>';
      return;
    }

    var map = L.map(container, { scrollWheelZoom: false });
    // Esri tiles, not OSM directly - OSM blocks third-party app traffic.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri — Sources: Esri, HERE, Garmin, USGS, NRCan, OpenStreetMap contributors, and the GIS community',
      maxZoom: 19,
    }).addTo(map);

    var seenAirports = {};
    var bounds = [];

    routes.forEach(function (r) {
      var originLatLng = [r.origin_lat, r.origin_lon];
      // destination_lat/lon is always the effective endpoint (diversion airport if any).
      var destLatLng = [r.destination_lat, r.destination_lon];

      L.polyline([originLatLng, destLatLng], {
        color: r.is_diverted ? '#e5566d' : '#4f8dfd',
        weight: 2,
        opacity: 0.7,
        dashArray: r.is_diverted ? '6 6' : null,
      }).addTo(map);

      var destKey = r.effective_destination_icao;
      var destPopup = destKey + (r.effective_destination_name ? ' — ' + r.effective_destination_name : '');
      if (r.is_diverted) destPopup += ' (diverted from ' + r.destination_icao + ')';

      [
        { key: r.origin_icao, latLng: originLatLng, popup: r.origin_icao + (r.origin_name ? ' — ' + r.origin_name : '') },
        { key: destKey, latLng: destLatLng, popup: destPopup },
      ].forEach(function (ap) {
        if (seenAirports[ap.key]) return;
        seenAirports[ap.key] = true;
        bounds.push(ap.latLng);
        L.circleMarker(ap.latLng, {
          radius: 5,
          color: '#3fbf83',
          fillColor: '#3fbf83',
          fillOpacity: 0.9,
          weight: 2,
        })
          .addTo(map)
          .bindPopup(ap.popup);
      });
    });

    map.fitBounds(bounds, { padding: [30, 30] });
  };
})();
