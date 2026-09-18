(function () {
  var form = document.querySelector('[data-flight-lookup-form]');
  if (!form) return;

  var button = form.querySelector('[data-role="lookup-button"]');
  var status = form.querySelector('[data-role="lookup-status"]');
  var flightNumberInput = form.querySelector('[data-role="lookup-flight-number"]');
  var dateInput = form.querySelector('[data-role="lookup-date"]');
  if (!button || !flightNumberInput || !dateInput) return;

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  // Never overwrites a field the API didn't return a value for.
  function fillIfPresent(id, value) {
    if (value === null || value === undefined || value === '') return;
    var el = document.getElementById(id);
    if (el) el.value = value;
  }

  // Fills the hidden id + label if matched, else returns a note about the raw text.
  function fillPicked(hiddenId, visibleId, picked, unmatchedText, kind) {
    if (picked) {
      var hidden = document.getElementById(hiddenId);
      var visible = document.getElementById(visibleId);
      if (hidden) hidden.value = picked.value;
      if (visible) visible.value = picked.label;
      return null;
    }
    if (unmatchedText) {
      return kind + ' "' + unmatchedText + '" - not in your list, search or add it manually.';
    }
    return null;
  }

  button.addEventListener('click', function () {
    var flightNumber = flightNumberInput.value.trim();
    var date = dateInput.value.trim();
    if (!flightNumber || !date) {
      setStatus('Enter a flight number and date first.');
      return;
    }

    setStatus('Looking up…');
    button.disabled = true;

    fetch('/flights/lookup?flightNumber=' + encodeURIComponent(flightNumber) + '&date=' + encodeURIComponent(date))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        button.disabled = false;

        if (!data.found) {
          setStatus('No matching flight found for that number and date - fill in manually.');
          return;
        }

        fillIfPresent('origin', data.origin);
        fillIfPresent('destination', data.destination);
        fillIfPresent('departureTime', data.departureTime);
        fillIfPresent('arrivalTime', data.arrivalTime);
        if (data.isDiverted) fillIfPresent('divertedTo', data.divertedTo);

        if (typeof data.durationMinutes === 'number') {
          var hoursEl = document.getElementById('durationHours');
          var minutesEl = document.getElementById('durationMinutesInput');
          if (hoursEl) hoursEl.value = Math.floor(data.durationMinutes / 60);
          if (minutesEl) minutesEl.value = data.durationMinutes % 60;
        }

        var notes = [];
        var carrierNote = fillPicked('carrierId', 'carrierSearch', data.carrier, data.unmatchedCarrierText, 'Carrier');
        if (carrierNote) notes.push(carrierNote);
        var aircraftNote = fillPicked('aircraftId', 'aircraftSearch', data.aircraft, data.unmatchedAircraftText, 'Aircraft');
        if (aircraftNote) notes.push(aircraftNote);

        if (data.isDiverted && !data.divertedTo) {
          notes.push('Flight shows as diverted, but the actual landing airport wasn\'t available - fill it in if you know it.');
        }

        setStatus(notes.length > 0 ? 'Found it. ' + notes.join(' ') : 'Found it - fields filled in below.');
      })
      .catch(function () {
        button.disabled = false;
        setStatus('Lookup failed - fill in manually.');
      });
  });
})();
