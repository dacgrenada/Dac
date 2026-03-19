// =============================================
// DAC - SECURE VERSION 4.0
// =============================================

'use strict';

// Configuration
const MAPS_API_KEY = 'AIzaSyBJfcDVXsepgm5a9qGt2bfaRFtOKOfo-sw';
const STRIPE_LINK = 'https://buy.stripe.com/8x26oB05y81Z4cL7cR5wI04';

// Parish data
const PARISHES = [
    { code: 'STG', name: 'St. George', bounds: { north: 12.09, south: 11.97, east: -61.63, west: -61.85 } },
    { code: 'STD', name: 'St. David', bounds: { north: 12.07, south: 11.97, east: -61.56, west: -61.63 } },
    { code: 'STA', name: 'St. Andrew', bounds: { north: 12.25, south: 12.04, east: -61.56, west: -61.65 } },
    { code: 'STP', name: 'St. Patrick', bounds: { north: 12.27, south: 12.17, east: -61.63, west: -61.76 } },
    { code: 'STM', name: 'St. Mark', bounds: { north: 12.19, south: 12.07, east: -61.70, west: -61.80 } },
    { code: 'STJ', name: 'St. John', bounds: { north: 12.12, south: 12.03, east: -61.72, west: -61.82 } },
    { code: 'CAR', name: 'Carriacou', bounds: { north: 12.55, south: 12.42, east: -61.42, west: -61.52 } },
    { code: 'PMQ', name: 'Petite Martinique', bounds: { north: 12.58, south: 12.51, east: -61.34, west: -61.41 } }
];

// Global variables
let map, marker, infoWindow;
let currentCode = null;
let currentLat = null;
let currentLng = null;
let currentParish = null;
let qrCanvas = null;

// =============================================
// MAP INITIALIZATION
// =============================================
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 12.1165, lng: -61.6790 },
        zoom: 11,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        mapTypeControl: true,
        streetViewControl: true
    });

    infoWindow = new google.maps.InfoWindow();
    map.addListener('click', handleMapClick);
    
    // Draw parish boundaries
    PARISHES.forEach(parish => {
        new google.maps.Rectangle({
            bounds: parish.bounds,
            map: map,
            strokeColor: '#f0a500',
            strokeOpacity: 0.3,
            strokeWeight: 1,
            fillColor: '#f0a500',
            fillOpacity: 0.03
        });
    });
}

// =============================================
// MAP CLICK HANDLER
// =============================================
function handleMapClick(e) {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    
    const parish = findParish(lat, lng);
    currentParish = parish;
    
    const code = generateCode(lat, lng, parish.code);
    
    currentCode = code;
    currentLat = lat;
    currentLng = lng;
    
    document.getElementById('location-code').textContent = code;
    document.getElementById('coord-display').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    document.getElementById('parish-display').textContent = parish.name;
    
    ['btn-layout', 'btn-print', 'btn-share', 'btn-download'].forEach(id => {
        document.getElementById(id).disabled = false;
    });
    
    placeMarker(lat, lng, code);
    generateQR(lat, lng);
    updateStreetView(lat, lng);
    saveToRegistry(code, lat, lng, parish);
    showToast('Code generated: ' + code);
}

function findParish(lat, lng) {
    for (let p of PARISHES) {
        if (lat >= p.bounds.south && lat <= p.bounds.north &&
            lng >= p.bounds.west && lng <= p.bounds.east) {
            return p;
        }
    }
    return PARISHES[0];
}

function generateCode(lat, lng, parishCode) {
    const str = `${lat.toFixed(6)}${lng.toFixed(6)}${parishCode}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    const suffix = Math.abs(hash).toString(36).toUpperCase().slice(0, 6).padStart(6, '0');
    return `GD-${parishCode}-${suffix}`;
}

function placeMarker(lat, lng, code) {
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
                strokeColor: '#fff',
                strokeWeight: 3,
                scale: 10
            }
        });
    }
    
    infoWindow.setContent(`<div style="font-family:monospace;padding:5px;"><strong>${code}</strong></div>`);
    infoWindow.open(map, marker);
}

// =============================================
// QR CODE GENERATION
// =============================================
function generateQR(lat, lng) {
    const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
    
    const container = document.getElementById('qr-container');
    const placeholder = document.getElementById('qr-placeholder');
    
    if (placeholder) placeholder.style.display = 'none';
    if (container) {
        container.style.display = 'block';
        container.innerHTML = '';
        
        new QRCode(container, {
            text: mapsUrl,
            width: 180,
            height: 180,
            colorDark: '#0c1220',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        
        setTimeout(() => {
            qrCanvas = container.querySelector('canvas');
        }, 100);
    }
}

// =============================================
// BUTTON HANDLERS
// =============================================

document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-print') {
        if (!currentCode) { showToast('Select a location first'); return; }
        
        const stickerData = {
            code: currentCode,
            lat: currentLat.toFixed(6),
            lng: currentLng.toFixed(6),
            parish: currentParish.name,
            dateStr: new Date().toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            }),
            qrUrl: qrCanvas ? qrCanvas.toDataURL('image/png') : '',
            stripeLink: STRIPE_LINK
        };
        
        localStorage.setItem('dac_sticker_data', JSON.stringify(stickerData));
        window.open('sticker.html', '_blank');
    }
});

document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-layout') {
        if (!currentCode) { showToast('Select a location first'); return; }
        
        const layoutData = {
            code: currentCode,
            lat: currentLat.toFixed(7),
            lng: currentLng.toFixed(7),
            regionName: currentParish.name,
            dateStr: new Date().toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            }),
            qrDataUrl: qrCanvas ? qrCanvas.toDataURL('image/png') : '',
            staticMapUrl: `https://maps.googleapis.com/maps/api/staticmap?center=${currentLat},${currentLng}&zoom=19&size=800x400&maptype=satellite&markers=color:red%7C${currentLat},${currentLng}&key=${MAPS_API_KEY}`,
            stripeLink: STRIPE_LINK
        };
        
        localStorage.setItem('dac_layout_data', JSON.stringify(layoutData));
        window.location.href = 'layout.html';
    }
});

document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-download' && qrCanvas) {
        const link = document.createElement('a');
        link.download = currentCode + '-qr.png';
        link.href = qrCanvas.toDataURL('image/png');
        link.click();
        showToast('QR downloaded');
    }
});

document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-share' && currentCode) {
        const text = `📍 DAC Code: ${currentCode}\n📍 ${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`;
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
    }
});

document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-search') {
        const code = document.getElementById('code-search').value.trim().toUpperCase();
        const registry = JSON.parse(localStorage.getItem('dac_registry') || '{}');
        const reverse = JSON.parse(localStorage.getItem('dac_reverse') || '{}');
        const key = reverse[code];
        
        if (key && registry[key]) {
            const loc = registry[key];
            map.panTo({ lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) });
            map.setZoom(18);
            handleMapClick({ latLng: { lat: () => parseFloat(loc.lat), lng: () => parseFloat(loc.lng) } });
        } else {
            showToast('Code not found');
        }
    }
});

// =============================================
// STREET VIEW
// =============================================
function updateStreetView(lat, lng) {
    const svDiv = document.getElementById('street-view');
    const svStatus = document.getElementById('sv-status');
    
    if (!svDiv || !svStatus) return;
    
    svStatus.textContent = 'Loading...';
    
    new google.maps.StreetViewService().getPanorama(
        { location: { lat, lng }, radius: 50 },
        (data, status) => {
            if (status === 'OK') {
                const panoLat = data.location.latLng.lat();
                const panoLng = data.location.latLng.lng();
                
                new google.maps.StreetViewPanorama(svDiv, {
                    position: { lat: panoLat, lng: panoLng },
                    pov: { heading: 0, pitch: 0 },
                    zoom: 1,
                    addressControl: false
                });
                
                svStatus.textContent = '✓ Available';
                svStatus.style.color = '#3abf9e';
            } else {
                svStatus.textContent = '✗ Not available';
                svStatus.style.color = '#e85d3a';
            }
        }
    );
}

// =============================================
// UTILITIES
// =============================================
function showToast(msg) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

function saveToRegistry(code, lat, lng, parish) {
    const registry = JSON.parse(localStorage.getItem('dac_registry') || '{}');
    const reverse = JSON.parse(localStorage.getItem('dac_reverse') || '{}');
    
    const key = `${lat.toFixed(7)},${lng.toFixed(7)}`;
    registry[key] = { code, lat: lat.toFixed(7), lng: lng.toFixed(7), parish: parish.code, parishName: parish.name };
    reverse[code] = key;
    
    localStorage.setItem('dac_registry', JSON.stringify(registry));
    localStorage.setItem('dac_reverse', JSON.stringify(reverse));
}

window.initMap = initMap;
