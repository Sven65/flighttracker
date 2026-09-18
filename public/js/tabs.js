(function () {
  var buttons = document.querySelectorAll('[data-tab]');
  if (buttons.length === 0) return;

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.dataset.tab;

      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      document.querySelectorAll('[data-tab-panel]').forEach(function (panel) {
        var show = panel.dataset.tabPanel === target;
        panel.hidden = !show;
        panel.classList.toggle('is-active', show);
      });

      // The map is only initialized the first time its tab is opened, so
      // its container is guaranteed visible (Leaflet sizes itself wrong
      // if built against a hidden, zero-size container).
      if (target === 'map' && typeof window.initFlightMap === 'function') {
        window.initFlightMap();
      }
    });
  });
})();
