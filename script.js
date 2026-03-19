// =============================================
// ULTIMATE PROTECTION
// =============================================
(function() {
    'use strict';
    
    // Override console
    const noop = function() {};
    console.log = noop;
    console.info = noop;
    console.warn = noop;
    console.error = noop;
    console.debug = noop;
    
    // Block shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && e.key === 'I') ||
            (e.ctrlKey && e.key === 'u')) {
            e.preventDefault();
            return false;
        }
    }, true);
    
    // DevTools size detection
    setInterval(function() {
        if (window.outerWidth - window.innerWidth > 200 || 
            window.outerHeight - window.innerHeight > 200) {
            window.location.href = '/';
        }
    }, 100);
})();

/**
 * DAC – Digital Address Codes v4.0 (SECURE)
 * ─────────────────────────────────────────────────────
 * Format: CC-PPP-XXXXXX
 */

'use strict';

// ============================================================
// SECTION 1 — CONSTANTS & CONFIG
// ============================================================

const GRENADA_CENTER      = { lat: 12.1165, lng: -61.6790 };
const DEFAULT_ZOOM        = 11;
const LAT_TO_METERS       = 111320;
const LNG_TO_METERS       = 108900;
const GRID_SIZE           = 50;
const MAPS_API_KEY        = 'AIzaSyBJfcDVXsepgm5a9qGt2bfaRFtOKOfo-sw';
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/8x26oB05y81Z4cL7cR5wI04';
const SNAP_PRECISION      = 5e-5;

// ============================================================
// SECTION 2 — GEOGRAPHIC DATA
// ============================================================

const PARISHES = [
  { code: 'STG', name: 'St. George',        bbox: { minLat: 11.97, maxLat: 12.09, minLng: -61.85, maxLng: -61.63 } },
  { code: 'STD', name: 'St. David',         bbox: { minLat: 11.97, maxLat: 12.07, minLng: -61.63, maxLng: -61.56 } },
  { code: 'STA', name: 'St. Andrew',        bbox: { minLat: 12.04, maxLat: 12.25, minLng: -61.65, maxLng: -61.56 } },
  { code: 'STP', name: 'St. Patrick',       bbox: { minLat: 12.17, maxLat: 12.27, minLng: -61.76, maxLng: -61.63 } },
  { code: 'STM', name: 'St. Mark',          bbox: { minLat: 12.07, maxLat: 12.19, minLng: -61.80, maxLng: -61.70 } },
  { code: 'STJ', name: 'St. John',          bbox: { minLat: 12.03, maxLat: 12.12, minLng: -61.82, maxLng: -61.72 } },
  { code: 'CAR', name: 'Carriacou',         bbox: { minLat: 12.42, maxLat: 12.55, minLng: -61.52, maxLng: -61.42 } },
  { code: 'PMQ', name: 'Petite Martinique', bbox: { minLat: 12.51, maxLat: 12.58, minLng: -61.41, maxLng: -61.34 } }
];

// ============================================================
// SECTION 3 — APPLICATION STATE
// ============================================================

let map               = null;
let marker            = null;
let infoWindow        = null;
let lastClick         = null;
let parishBoxes       = [];
let currentCode       = null;
let currentLat        = null;
let currentLng        = null;
let currentRegion     = null;
let currentParishName = null;
let currentMapsUrl    = null;
let streetViewPanorama  = null;
let streetViewStaticUrl = '';

// ============================================================
// SECTION 4 — COORDINATE & REGISTRY UTILITIES
// ============================================================

function snapCoord(v) {
  return Math.round(v / SNAP_PRECISION) * SNAP_PRECISION;
}

function buildHashKey(lat, lng) {
  return `${snapCoord(lat).toFixed(7)},${snapCoord(lng).toFixed(7)}`;
}

function loadRegistry() {
  try { return JSON.parse(localStorage.getItem('dac_registry') || '{}'); }
  catch { return {}; }
}

function saveRegistry(reg) {
  try { localStorage.setItem('dac_registry', JSON.stringify(reg)); } catch {}
}

function loadReverseIndex() {
  try { return JSON.parse(localStorage.getItem('dac_reverse') || '{}'); }
  catch { return {}; }
}

function saveReverseIndex(idx) {
  try { localStorage.setItem('dac_reverse', JSON.stringify(idx)); } catch {}
}

function lookupCodeInRegistry(code) {
  const reverseIdx = loadReverseIndex();
  const registry   = loadRegistry();
  const hashKey    = reverseIdx[code];
  if (!hashKey) return null;
  return registry[hashKey] || null;
}

// ============================================================
// SECTION 5 — CODE GENERATION
// ============================================================

function hashLatLng(lat, lng) {
  const str = buildHashKey(lat, lng);
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

function generateUniqueCode(lat, lng, regionCode, countryCode) {
  const suffix = hashLatLng(lat, lng);
  const cc  = (countryCode || 'GD').toUpperCase().slice(0, 2);
  const ppp = (regionCode  || 'UNK').toUpperCase().slice(0, 3);
  return `${cc}-${ppp}-${suffix}`;
}

function getOrCreateLocationCode(lat, lng, region, countryCode) {
  const registry   = loadRegistry();
  const reverseIdx = loadReverseIndex();
  const hashKey    = buildHashKey(lat, lng);

  if (registry[hashKey]) return registry[hashKey].code;

  const code = generateUniqueCode(lat, lng, region.code, countryCode);

  registry[hashKey] = {
    code,
    lat: snapCoord(lat),
    lng: snapCoord(lng),
    parish: region.code,
    parishName: region.name,
    country: countryCode,
    timestamp: Date.now()
  };

  reverseIdx[code] = hashKey;
  saveRegistry(registry);
  saveReverseIndex(reverseIdx);
  return code;
}

// ============================================================
// SECTION 6 — LOCATION DETECTION
// ============================================================

function detectGrenadaParish(lat, lng) {
  for (const p of PARISHES) {
    const { minLat, maxLat, minLng, maxLng } = p.bbox;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return { code: p.code, name: p.name };
    }
  }
  return { code: 'STG', name: 'St. George' };
}

function getLocationInfo(lat, lng) {
  // Simplified for Grenada only
  const region = detectGrenadaParish(lat, lng);
  return { 
    countryCode: 'GD', 
    regionCode: region.code, 
    regionName: region.name 
  };
}

// ============================================================
// SECTION 7 — MAP INITIALISATION
// ============================================================

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: GRENADA_CENTER,
    zoom: DEFAULT_ZOOM,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    mapTypeControl: true,
    zoomControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#1e2d44' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#0c1220' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#e8eef6' }] }
    ]
  });

  infoWindow = new google.maps.InfoWindow();
  map.addListener('click', handleMapClick);
  drawParishBoxes();
}

function drawParishBoxes() {
  const colors = ['#f0a500', '#3abf9e', '#e85d3a'];
  PARISHES.forEach((parish, i) => {
    const { minLat, maxLat, minLng, maxLng } = parish.bbox;
    const rect = new google.maps.Rectangle({
      bounds: { north: maxLat, south: minLat, east: maxLng, west: minLng },
      map,
      strokeColor: colors[i % colors.length],
      strokeOpacity: 0.5,
      strokeWeight: 1,
      fillColor: colors[i % colors.length],
      fillOpacity: 0.03
    });
    rect.addListener('click', handleMapClick);
    parishBoxes.push(rect);
  });
}

// ============================================================
// SECTION 8 — MAP CLICK HANDLER & MARKER
// ============================================================

function handleMapClick(e) {
  const lat = e.latLng.lat();
  const lng = e.latLng.lng();
  lastClick = { lat, lng };

  const { countryCode, regionCode, regionName } = getLocationInfo(lat, lng);
  const region = { code: regionCode, name: regionName };
  const code = getOrCreateLocationCode(lat, lng, region, countryCode);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  currentRegion = region;
  currentParishName = regionName;

  placeMarker(lat, lng, code, region);
  generateQRCode(mapsUrl);
  updateUI({ code, lat, lng, region, countryCode, mapsUrl });
  updateStreetView(lat, lng);
}

function placeMarker(lat, lng, code, region) {
  const position = { lat, lng };
  
  if (marker) {
    marker.setPosition(position);
  } else {
    marker = new google.maps.Marker({
      position,
      map,
      animation: google.maps.Animation.DROP,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#f0a500',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
        scale: 10
      }
    });
  }

  infoWindow.setContent(
    `<div style="font-family:monospace;font-size:12px;color:#0c1220;padding:6px;background:#fff;border-radius:4px;">
      <strong>${code}</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}
    </div>`
  );
  infoWindow.open(map, marker);
}

// ============================================================
// SECTION 9 — STREET VIEW
// ============================================================

function updateStreetView(lat, lng) {
  const svDiv = document.getElementById('street-view');
  const svStatus = document.getElementById('sv-status');
  
  if (!svDiv || !svStatus) return;

  const svService = new google.maps.StreetViewService();

  svService.getPanorama(
    { location: { lat, lng }, radius: 50 },
    (data, status) => {
      if (status === google.maps.StreetViewStatus.OK) {
        const panoLat = data.location.latLng.lat();
        const panoLng = data.location.latLng.lng();

        streetViewStaticUrl =
          `https://maps.googleapis.com/maps/api/streetview`
          + `?size=640x320`
          + `&location=${panoLat},${panoLng}`
          + `&fov=90&heading=0&pitch=0`
          + `&key=${MAPS_API_KEY}`;

        if (!streetViewPanorama) {
          streetViewPanorama = new google.maps.StreetViewPanorama(svDiv, {
            position: { lat: panoLat, lng: panoLng },
            pov: { heading: 0, pitch: 0 },
            zoom: 1,
            addressControl: false
          });
        } else {
          streetViewPanorama.setPosition({ lat: panoLat, lng: panoLng });
        }

        svStatus.textContent = '✓ Available';
        svStatus.style.color = '#3abf9e';
      } else {
        svStatus.textContent = '✗ Not available';
        svStatus.style.color = '#e85d3a';
        streetViewStaticUrl = '';
      }
    }
  );
}

// ============================================================
// SECTION 10 — QR CODE GENERATION
// ============================================================

function generateQRCode(url) {
  const wrapper = document.getElementById('qr-wrapper');
  if (!wrapper) return;
  
  const placeholder = wrapper.querySelector('.qr-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  
  const existingQR = wrapper.querySelector('.qr-generated, canvas');
  if (existingQR) existingQR.remove();
  
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  canvas.style.cssText = 'border-radius:6px; border:3px solid #f0a500; padding:8px; background:white; max-width:100%; display:block; margin:0 auto;';
  canvas.className = 'qr-generated';
  canvas.id = 'qr-canvas';
  
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  document.body.appendChild(tempDiv);
  
  new QRCode(tempDiv, {
    text: url,
    width: 200,
    height: 200,
    colorDark: '#0c1220',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  
  setTimeout(() => {
    const sourceCanvas = tempDiv.querySelector('canvas');
    if (sourceCanvas) {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(sourceCanvas, 0, 0, 200, 200);
      wrapper.appendChild(canvas);
    }
    tempDiv.remove();
  }, 100);
}

// ============================================================
// SECTION 11 — UI HELPERS
// ============================================================

function updateUI(data) {
  currentCode = data.code;
  currentLat = data.lat;
  currentLng = data.lng;
  currentMapsUrl = data.mapsUrl;

  const codeEl = document.getElementById('location-code');
  if (codeEl) codeEl.textContent = data.code;

  const coordEl = document.getElementById('coord-display');
  if (coordEl) coordEl.textContent = `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`;

  const parishEl = document.getElementById('parish-display');
  if (parishEl) parishEl.textContent = `${data.region.name}`;

  ['btn-download', 'btn-print', 'btn-share', 'btn-layout'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = false;
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ============================================================
// SECTION 12 — SEARCH
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const btnSearch = document.getElementById('btn-search');
  const inputSearch = document.getElementById('code-search');
  
  if (!btnSearch || !inputSearch) return;

  function doSearch() {
    const code = inputSearch.value.trim().toUpperCase();
    if (!code) return;

    const entry = lookupCodeInRegistry(code);
    if (entry) {
      const lat = entry.lat;
      const lng = entry.lng;
      const region = { code: entry.parish, name: entry.parishName };
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

      map.panTo({ lat, lng });
      map.setZoom(18);
      currentRegion = region;
      placeMarker(lat, lng, code, region);
      generateQRCode(mapsUrl);
      updateUI({ code, lat, lng, region, countryCode: 'GD', mapsUrl });
      updateStreetView(lat, lng);
      showToast(`Loaded: ${code}`);
    } else {
      showToast('Code not found');
    }
  }

  btnSearch.onclick = doSearch;
  inputSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
});

// ============================================================
// SECTION 13 — DOWNLOAD QR
// ============================================================

document.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-download') return;
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = (currentCode || 'dac') + '-qr.png';
  link.click();
  showToast('QR downloaded');
});

// ============================================================
// SECTION 14 — PRINT STICKER (UPDATED FOR SECURE PAGES)
// ============================================================

document.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-print') return;
  if (!currentCode || currentLat === null) { 
    showToast('Pin a property first'); 
    return; 
  }
  generateStickerPreview();
});

function generateStickerPreview() {
  const canvas = document.getElementById('qr-canvas');
  const qrDataUrl = canvas ? canvas.toDataURL('image/png') : '';

  const lat = currentLat.toFixed(6);
  const lng = currentLng.toFixed(6);
  const dateStr = new Date().toLocaleDateString('en-GD', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Save ALL required data for the secure sticker page
  const stickerData = {
    code: currentCode,
    lat: lat,
    lng: lng,
    dateStr: dateStr,
    qrUrl: qrDataUrl,
    parishName: currentParishName || 'St. George',
    stripeLink: STRIPE_PAYMENT_LINK
  };

  try {
    localStorage.setItem('dac_sticker_data', JSON.stringify(stickerData));
    console.log('Sticker data saved:', stickerData); // For debugging
  } catch(e) {
    console.error('Failed to save sticker data:', e);
  }

  window.open('sticker.html', '_blank');
}

// ============================================================
// SECTION 15 — SHARE LOCATION
// ============================================================

document.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-share') return;
  if (!currentMapsUrl) return;
  
  const text = `My DAC Address Code: ${currentCode} - ${currentMapsUrl}`;
  
  if (navigator.share) {
    navigator.share({ title: 'DAC Address', text });
  } else {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  }
});

// ============================================================
// SECTION 16 — PROPERTY LAYOUT GENERATOR (UPDATED)
// ============================================================

document.addEventListener('click', (e) => {
  if (e.target.id === 'btn-layout' || e.target.closest('#btn-layout')) {
    generatePropertyLayout();
  }
});

function generatePropertyLayout() {
  if (!currentCode || currentLat === null) {
    showToast('Pin a property first');
    return;
  }

  showToast('Generating preview…');

  const lat = currentLat.toFixed(7);
  const lng = currentLng.toFixed(7);
  const zoom = 19;

  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap`
    + `?center=${lat},${lng}`
    + `&zoom=${zoom}`
    + `&size=640x400`
    + `&scale=2`
    + `&maptype=satellite`
    + `&markers=color:0xf0a500%7Csize:mid%7C${lat},${lng}`
    + `&key=${MAPS_API_KEY}`;

  const svStaticUrl = streetViewStaticUrl || '';
  const regionName = currentParishName || 'St. George';
  const dateStr = new Date().toLocaleDateString('en-GD', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const canvas = document.getElementById('qr-canvas');
  const qrDataUrl = canvas ? canvas.toDataURL('image/png') : '';

  // Save ALL required data for the secure layout page
  const layoutData = {
    code: currentCode,
    lat: lat,
    lng: lng,
    zoom: zoom,
    staticMapUrl: staticMapUrl,
    svStaticUrl: svStaticUrl,
    regionName: regionName,
    dateStr: dateStr,
    qrDataUrl: qrDataUrl,
    stripeLink: STRIPE_PAYMENT_LINK
  };

  try {
    localStorage.setItem('dac_layout_data', JSON.stringify(layoutData));
    console.log('Layout data saved:', layoutData); // For debugging
  } catch(e) {
    console.error('Failed to save layout data:', e);
  }

  window.location.href = 'layout.html';
}

// ============================================================
// SECTION 17 — MAKE FUNCTIONS GLOBAL
// ============================================================
window.initMap = initMap;
