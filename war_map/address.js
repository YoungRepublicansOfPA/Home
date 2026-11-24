(() => {
  const form = document.getElementById('address-form');
  const input = document.getElementById('address-input');
  const status = document.getElementById('address-status');
  const endpoint = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
  const addressTypes = new Set(['Subaddress', 'PointAddress', 'StreetAddress']);
  let active;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const address = input.value.trim();
    if (!/^\d+[\w-]*\s+\S/.test(address)) {
      status.textContent = 'Enter a numbered street address and its city or ZIP code.';
      return;
    }
    const query = new URLSearchParams({
      SingleLine: address, sourceCountry: 'USA', outFields: 'Addr_type,RegionAbbr',
      outSR: '4326', maxLocations: '6', f: 'json'
    });
    const timer = setTimeout(() => controller.abort(), 12000);
    status.textContent = 'Finding your Pennsylvania street address…';
    try {
      const response = await fetch(endpoint + '?' + query, {
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw Error('Geocoding failed');
      const result = await response.json();
      if (result.error || !Array.isArray(result.candidates)) throw Error('Invalid geocoder response');
      const candidates = result.candidates.filter(candidate =>
        addressTypes.has(candidate.attributes?.Addr_type) && candidate.score >= 98 &&
        Number.isFinite(candidate.location?.x) && Number.isFinite(candidate.location?.y)
      ).sort((a, b) => b.score - a.score);
      const best = candidates[0];
      if (!best || best.attributes.RegionAbbr !== 'PA') {
        status.textContent = 'No confident Pennsylvania street match. Include the city, PA and ZIP code.';
        return;
      }
      const tie = candidates.some(candidate => candidate.score === best.score &&
        (Math.abs(candidate.location.x - best.location.x) > 0.00005 ||
         Math.abs(candidate.location.y - best.location.y) > 0.00005));
      if (tie) {
        status.textContent = 'Multiple addresses matched. Add the city and ZIP code to narrow the search.';
        return;
      }
      clearTimeout(timer);
      const located = await window.locatePaAddress(best.location.x, best.location.y, best.address, controller.signal);
      if (controller !== active) return;
      if (located === false) {
        status.textContent = 'Address matched, but no mapped precinct was found here.';
        return;
      }
      status.textContent = 'Matched ' + best.address + (best.attributes.Addr_type === 'StreetAddress'
        ? '. This position is estimated along the street.' : '.');
    } catch (error) {
      if (controller !== active) return;
      status.textContent = error.name === 'AbortError' ? 'Address lookup timed out. Try again.' :
        'Address lookup is unavailable. Select your county and precinct on the map.';
    } finally {
      clearTimeout(timer);
    }
  });
})();
