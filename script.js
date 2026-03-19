// =============================================
// DAC - SIMPLIFIED WORKING VERSION
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
    
    // Find parish
    const parish = findParish(lat, lng);
    currentParish = parish;
    
    // Generate code
    const code = generateCode(lat, lng, parish.code);
    
    // Save to global variables
    currentCode = code;
    currentLat = lat;
    currentLng = lng;
    
    // Update UI
    document.getElementById('location-code').textContent = code;
    document.getElementById('coord-display').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    document.getElementById('parish-display').textContent = parish.name;
    
    // Enable buttons
    document.getElementById('btn-layout').disabled = false;
    document.getElementById('btn-print').disabled = false;
    document.getElementById('btn-share').disabled = false;
    
    // Place marker
    placeMarker(lat, lng, code);
    
    // Generate QR
    generateQR(lat, lng);
    
    // Show toast
    showToast('Code generated: ' + code);
}

function findParish(lat, lng) {
    for (let p of PARISHES) {
        if (lat >= p.bounds.south && lat <= p.bounds.north &&
            lng >= p.bounds.west && lng <= p.bounds.east) {
            return p;
        }
    }
    return PARISHES[0]; // Default to St. George
}

function generateCode(lat, lng, parishCode) {
    // Simple hash function
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
        
        // Save canvas reference
        setTimeout(() => {
            qrCanvas = container.querySelector('canvas');
        }, 100);
    }
}

// =============================================
// BUTTON HANDLERS
// =============================================

// Print Sticker
document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-print') {
        if (!currentCode) {
            showToast('Please select a location first');
            return;
        }
        
        // Get QR data URL
        let qrDataUrl = '';
        if (qrCanvas) {
            qrDataUrl = qrCanvas.toDataURL('image/png');
        }
        
        // Prepare sticker data
        const stickerData = {
            code: currentCode,
            lat: currentLat.toFixed(6),
            lng: currentLng.toFixed(6),
            parish: currentParish.name,
            dateStr: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            qrUrl: qrDataUrl
        };
        
        // Save to localStorage
        localStorage.setItem('dac_sticker_data', JSON.stringify(stickerData));
        console.log('Sticker data saved:', stickerData);
        
        // Open sticker page
        window.open('sticker.html', '_blank');
    }
});

// Property Layout
document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-layout') {
        if (!currentCode) {
            showToast('Please select a location first');
            return;
        }
        
        // Get QR data URL
        let qrDataUrl = '';
        if (qrCanvas) {
            qrDataUrl = qrCanvas.toDataURL('image/png');
        }
        
        // Prepare layout data
        const layoutData = {
            code: currentCode,
            lat: currentLat.toFixed(7),
            lng: currentLng.toFixed(7),
            parish: currentParish.name,
            dateStr: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            qrDataUrl: qrDataUrl,
            staticMapUrl: `https://maps.googleapis.com/maps/api/staticmap?center=${currentLat},${currentLng}&zoom=19&size=800x400&maptype=satellite&markers=color:red%7C${currentLat},${currentLng}&key=${MAPS_API_KEY}`
        };
        
        // Save to localStorage
        localStorage.setItem('dac_layout_data', JSON.stringify(layoutData));
        console.log('Layout data saved:', layoutData);
        
        // Go to layout page
        window.location.href = 'layout.html';
    }
});

// Share
document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-share' && currentCode) {
        const text = `📍 DAC Code: ${currentCode}\n📍 ${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`;
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
    }
});

// Search
document.addEventListener('click', function(e) {
    if (e.target.id === 'btn-search') {
        const input = document.getElementById('code-search');
        const code = input.value.trim().toUpperCase();
        
        // Search in localStorage
        const reverse = JSON.parse(localStorage.getItem('dac_reverse') || '{}');
        const registry = JSON.parse(localStorage.getItem('dac_registry') || '{}');
        const key = reverse[code];
        
        if (key && registry[key]) {
            const loc = registry[key];
            map.panTo({ lat: loc.lat, lng: loc.lng });
            map.setZoom(18);
            handleMapClick({ latLng: { lat: () => loc.lat, lng: () => loc.lng } });
        } else {
            showToast('Code not found');
        }
    }
});

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

// Make initMap global
window.initMap = initMap;
