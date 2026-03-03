/**
 * DAC – Digital Address Codes v3.0
 * ─────────────────────────────────────────────────────
 * Format: CC-PPP-XXXXXX
 *   CC      = ISO 3166-1 alpha-2 country code  (GD, US, GB, CA …)
 *   PPP     = 3-letter parish / city / region code
 *   XXXXXX  = 6-char unique property hash (2+ billion combos)
 */

'use strict';

// ============================================================
// CONSTANTS
// ============================================================

const GRENADA_CENTER = { lat: 12.1165, lng: -61.6790 };
const DEFAULT_ZOOM   = 11;
const LAT_TO_METERS  = 111320;
const LNG_TO_METERS  = 108900;
const GRID_SIZE      = 50;
const MAPS_API_KEY   = 'AIzaSyBJfcDVXsepgm5a9qGt2bfaRFtOKOfo-sw';

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
// GLOBAL REGISTRY
// ============================================================

// Street View globals
let streetViewPanorama = null;
let streetViewStaticUrl = '';

const SNAP_PRECISION = 5e-5;

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

// ============================================================
// UNIQUE CODE GENERATION
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

// CC-PPP-XXXXXX  e.g. GD-STG-A7F3K9
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

function lookupCodeInRegistry(code) {
  const reverseIdx = loadReverseIndex();
  const registry   = loadRegistry();
  const hashKey    = reverseIdx[code];
  if (!hashKey) return null;
  return registry[hashKey] || null;
}

// ============================================================
// LOCATION DETECTION  (Google Geocoding API — global)
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

// ============================================================
// COUNTRY + REGION DATABASE  (coordinate bounding boxes)
// No API call needed — works fully offline
// ============================================================

const COUNTRY_DB = [
  { cc:'GD', name:'Grenada', minLat:11.9, maxLat:12.6, minLng:-61.9, maxLng:-61.3 },
  { cc:'MS', name:'Montserrat', minLat:16.6, maxLat:16.9, minLng:-62.3, maxLng:-62.1 },
  { cc:'AI', name:'Anguilla', minLat:18.1, maxLat:18.3, minLng:-63.2, maxLng:-62.9 },
  { cc:'AW', name:'Aruba', minLat:12.4, maxLat:12.7, minLng:-70.1, maxLng:-69.8 },
  { cc:'KN', name:'St. Kitts & Nevis', minLat:17.1, maxLat:17.4, minLng:-62.9, maxLng:-62.5 },
  { cc:'DM', name:'Dominica', minLat:15.2, maxLat:15.6, minLng:-61.5, maxLng:-61.2 },
  { cc:'SG', name:'Singapore', minLat:1.2, maxLat:1.5, minLng:103.6, maxLng:104.0 },
  { cc:'BB', name:'Barbados', minLat:13.0, maxLat:13.4, minLng:-59.7, maxLng:-59.4 },
  { cc:'LC', name:'St. Lucia', minLat:13.7, maxLat:14.1, minLng:-61.1, maxLng:-60.8 },
  { cc:'MT', name:'Malta', minLat:35.8, maxLat:36.1, minLng:14.2, maxLng:14.6 },
  { cc:'BH', name:'Bahrain', minLat:25.8, maxLat:26.3, minLng:50.4, maxLng:50.7 },
  { cc:'CW', name:'Curacao', minLat:12.0, maxLat:12.4, minLng:-69.2, maxLng:-68.7 },
  { cc:'MQ', name:'Martinique', minLat:14.4, maxLat:14.9, minLng:-61.2, maxLng:-60.8 },
  { cc:'GU', name:'Guam', minLat:13.2, maxLat:13.7, minLng:144.6, maxLng:145.0 },
  { cc:'AG', name:'Antigua & Barbuda', minLat:16.9, maxLat:17.7, minLng:-61.9, maxLng:-61.6 },
  { cc:'VG', name:'British Virgin Islands', minLat:18.3, maxLat:18.8, minLng:-64.8, maxLng:-64.3 },
  { cc:'MU', name:'Mauritius', minLat:-20.5, maxLat:-19.9, minLng:57.3, maxLng:57.8 },
  { cc:'HK', name:'Hong Kong', minLat:22.1, maxLat:22.6, minLng:113.8, maxLng:114.4 },
  { cc:'VC', name:'St. Vincent', minLat:12.5, maxLat:13.4, minLng:-61.5, maxLng:-61.1 },
  { cc:'VI', name:'US Virgin Islands', minLat:17.6, maxLat:18.4, minLng:-65.1, maxLng:-64.6 },
  { cc:'GP', name:'Guadeloupe', minLat:15.8, maxLat:16.5, minLng:-61.8, maxLng:-61.0 },
  { cc:'LU', name:'Luxembourg', minLat:49.4, maxLat:50.2, minLng:5.7, maxLng:6.5 },
  { cc:'TC', name:'Turks & Caicos', minLat:21.4, maxLat:21.9, minLng:-72.5, maxLng:-71.1 },
  { cc:'WS', name:'Samoa', minLat:-14.1, maxLat:-13.4, minLng:-172.8, maxLng:-171.4 },
  { cc:'PR', name:'Puerto Rico', minLat:17.9, maxLat:18.5, minLng:-67.3, maxLng:-65.6 },
  { cc:'KY', name:'Cayman Islands', minLat:19.2, maxLat:19.8, minLng:-81.5, maxLng:-79.7 },
  { cc:'KM', name:'Comoros', minLat:-12.4, maxLat:-11.4, minLng:43.2, maxLng:44.6 },
  { cc:'QA', name:'Qatar', minLat:24.5, maxLat:26.2, minLng:50.7, maxLng:51.7 },
  { cc:'JM', name:'Jamaica', minLat:17.7, maxLat:18.5, minLng:-78.4, maxLng:-76.2 },
  { cc:'TT', name:'Trinidad & Tobago', minLat:10.0, maxLat:11.4, minLng:-61.9, maxLng:-60.5 },
  { cc:'SZ', name:'Eswatini', minLat:-27.3, maxLat:-25.7, minLng:30.8, maxLng:32.1 },
  { cc:'PS', name:'Palestine', minLat:31.2, maxLat:32.6, minLng:34.2, maxLng:35.7 },
  { cc:'GM', name:'Gambia', minLat:13.1, maxLat:13.8, minLng:-16.8, maxLng:-13.8 },
  { cc:'LB', name:'Lebanon', minLat:33.1, maxLat:34.7, minLng:35.1, maxLng:36.6 },
  { cc:'CY', name:'Cyprus', minLat:34.6, maxLat:35.7, minLng:32.3, maxLng:34.6 },
  { cc:'DJ', name:'Djibouti', minLat:11.0, maxLat:12.7, minLng:41.8, maxLng:43.4 },
  { cc:'KW', name:'Kuwait', minLat:28.5, maxLat:30.1, minLng:46.5, maxLng:48.4 },
  { cc:'ME', name:'Montenegro', minLat:41.9, maxLat:43.5, minLng:18.4, maxLng:20.4 },
  { cc:'SV', name:'El Salvador', minLat:13.1, maxLat:14.5, minLng:-90.1, maxLng:-87.7 },
  { cc:'RW', name:'Rwanda', minLat:-2.8, maxLat:-1.1, minLng:28.9, maxLng:30.9 },
  { cc:'MK', name:'N. Macedonia', minLat:40.9, maxLat:42.4, minLng:20.5, maxLng:22.9 },
  { cc:'BZ', name:'Belize', minLat:15.9, maxLat:18.5, minLng:-89.2, maxLng:-87.8 },
  { cc:'FK', name:'Falkland Islands', minLat:-52.3, maxLat:-51.2, minLng:-61.3, maxLng:-57.7 },
  { cc:'BI', name:'Burundi', minLat:-4.5, maxLat:-2.3, minLng:29.0, maxLng:30.8 },
  { cc:'SI', name:'Slovenia', minLat:45.4, maxLat:46.9, minLng:13.4, maxLng:16.6 },
  { cc:'LS', name:'Lesotho', minLat:-30.6, maxLat:-28.6, minLng:27.0, maxLng:29.5 },
  { cc:'BT', name:'Bhutan', minLat:26.7, maxLat:28.3, minLng:88.8, maxLng:92.1 },
  { cc:'GW', name:'Guinea-Bissau', minLat:10.9, maxLat:12.7, minLng:-16.7, maxLng:-13.6 },
  { cc:'AL', name:'Albania', minLat:39.6, maxLat:42.7, minLng:19.3, maxLng:21.1 },
  { cc:'IL', name:'Israel', minLat:29.5, maxLat:33.3, minLng:34.3, maxLng:35.9 },
  { cc:'HT', name:'Haiti', minLat:18.0, maxLat:20.1, minLng:-74.5, maxLng:-71.6 },
  { cc:'TW', name:'Taiwan', minLat:21.9, maxLat:25.3, minLng:120.1, maxLng:121.9 },
  { cc:'BE', name:'Belgium', minLat:49.5, maxLat:51.5, minLng:2.5, maxLng:6.4 },
  { cc:'AM', name:'Armenia', minLat:38.8, maxLat:41.3, minLng:43.4, maxLng:46.6 },
  { cc:'TG', name:'Togo', minLat:6.1, maxLat:11.1, minLng:0.1, maxLng:1.8 },
  { cc:'LK', name:'Sri Lanka', minLat:5.9, maxLat:9.8, minLng:79.7, maxLng:81.9 },
  { cc:'CH', name:'Switzerland', minLat:45.8, maxLat:47.8, minLng:6.0, maxLng:10.5 },
  { cc:'DO', name:'Dominican Republic', minLat:17.5, maxLat:20.0, minLng:-72.0, maxLng:-68.3 },
  { cc:'SL', name:'Sierra Leone', minLat:6.9, maxLat:10.0, minLng:-13.3, maxLng:-10.3 },
  { cc:'MV', name:'Maldives', minLat:-0.7, maxLat:7.1, minLng:72.6, maxLng:73.8 },
  { cc:'FJ', name:'Fiji', minLat:-19.2, maxLat:-15.7, minLng:177.3, maxLng:180.0 },
  { cc:'TO', name:'Tonga', minLat:-21.4, maxLat:-15.6, minLng:-175.5, maxLng:-173.7 },
  { cc:'MD', name:'Moldova', minLat:45.5, maxLat:48.5, minLng:26.6, maxLng:30.1 },
  { cc:'BA', name:'Bosnia', minLat:42.6, maxLat:45.3, minLng:15.7, maxLng:19.6 },
  { cc:'NL', name:'Netherlands', minLat:50.8, maxLat:53.5, minLng:3.3, maxLng:7.2 },
  { cc:'CR', name:'Costa Rica', minLat:8.0, maxLat:11.2, minLng:-85.9, maxLng:-82.6 },
  { cc:'SK', name:'Slovakia', minLat:47.7, maxLat:49.6, minLng:16.8, maxLng:22.6 },
  { cc:'GF', name:'French Guiana', minLat:2.1, maxLat:5.8, minLng:-54.6, maxLng:-51.6 },
  { cc:'NC', name:'New Caledonia', minLat:-22.7, maxLat:-19.6, minLng:163.9, maxLng:167.6 },
  { cc:'PA', name:'Panama', minLat:7.2, maxLat:9.6, minLng:-83.1, maxLng:-77.2 },
  { cc:'EE', name:'Estonia', minLat:57.5, maxLat:59.7, minLng:21.7, maxLng:28.2 },
  { cc:'LT', name:'Lithuania', minLat:53.9, maxLat:56.5, minLng:20.9, maxLng:26.8 },
  { cc:'LV', name:'Latvia', minLat:55.7, maxLat:57.9, minLng:20.9, maxLng:28.2 },
  { cc:'GT', name:'Guatemala', minLat:13.7, maxLat:17.8, minLng:-92.2, maxLng:-88.2 },
  { cc:'GE', name:'Georgia', minLat:41.1, maxLat:43.6, minLng:40.0, maxLng:46.7 },
  { cc:'AE', name:'UAE', minLat:22.6, maxLat:26.1, minLng:51.6, maxLng:56.4 },
  { cc:'RS', name:'Serbia', minLat:42.2, maxLat:46.2, minLng:18.8, maxLng:23.0 },
  { cc:'CZ', name:'Czech Republic', minLat:48.6, maxLat:51.1, minLng:12.1, maxLng:18.9 },
  { cc:'LR', name:'Liberia', minLat:4.4, maxLat:8.6, minLng:-11.5, maxLng:-7.4 },
  { cc:'SR', name:'Suriname', minLat:1.8, maxLat:6.0, minLng:-58.1, maxLng:-53.9 },
  { cc:'PT', name:'Portugal', minLat:36.8, maxLat:42.2, minLng:-9.5, maxLng:-6.2 },
  { cc:'IE', name:'Ireland', minLat:51.4, maxLat:55.4, minLng:-10.5, maxLng:-6.0 },
  { cc:'JO', name:'Jordan', minLat:29.2, maxLat:33.4, minLng:34.9, maxLng:39.3 },
  { cc:'BG', name:'Bulgaria', minLat:41.2, maxLat:44.2, minLng:22.4, maxLng:28.6 },
  { cc:'PW', name:'Palau', minLat:2.8, maxLat:8.1, minLng:131.1, maxLng:134.7 },
  { cc:'BJ', name:'Benin', minLat:6.2, maxLat:12.4, minLng:0.8, maxLng:3.9 },
  { cc:'AZ', name:'Azerbaijan', minLat:38.4, maxLat:41.9, minLng:44.8, maxLng:50.4 },
  { cc:'HU', name:'Hungary', minLat:45.7, maxLat:48.6, minLng:16.1, maxLng:22.9 },
  { cc:'GQ', name:'Equatorial Guinea', minLat:0.9, maxLat:4.3, minLng:5.6, maxLng:11.4 },
  { cc:'NI', name:'Nicaragua', minLat:10.7, maxLat:15.0, minLng:-87.7, maxLng:-83.1 },
  { cc:'AT', name:'Austria', minLat:46.4, maxLat:49.0, minLng:9.5, maxLng:17.2 },
  { cc:'HN', name:'Honduras', minLat:13.0, maxLat:16.5, minLng:-89.4, maxLng:-83.1 },
  { cc:'DK', name:'Denmark', minLat:54.6, maxLat:57.8, minLng:8.1, maxLng:15.2 },
  { cc:'KH', name:'Cambodia', minLat:10.4, maxLat:14.7, minLng:102.3, maxLng:107.6 },
  { cc:'MW', name:'Malawi', minLat:-17.1, maxLat:-9.4, minLng:32.7, maxLng:35.9 },
  { cc:'HR', name:'Croatia', minLat:42.4, maxLat:46.6, minLng:13.5, maxLng:19.4 },
  { cc:'UY', name:'Uruguay', minLat:-34.9, maxLat:-30.1, minLng:-58.4, maxLng:-53.1 },
  { cc:'VU', name:'Vanuatu', minLat:-20.2, maxLat:-13.1, minLng:166.5, maxLng:170.2 },
  { cc:'SN', name:'Senegal', minLat:12.3, maxLat:16.7, minLng:-17.5, maxLng:-11.4 },
  { cc:'KR', name:'South Korea', minLat:33.1, maxLat:38.6, minLng:124.6, maxLng:129.6 },
  { cc:'BD', name:'Bangladesh', minLat:20.7, maxLat:26.6, minLng:88.0, maxLng:92.7 },
  { cc:'GH', name:'Ghana', minLat:4.7, maxLat:11.2, minLng:-3.3, maxLng:1.2 },
  { cc:'TN', name:'Tunisia', minLat:30.2, maxLat:37.5, minLng:7.5, maxLng:11.6 },
  { cc:'KP', name:'North Korea', minLat:37.7, maxLat:42.5, minLng:124.3, maxLng:130.7 },
  { cc:'UG', name:'Uganda', minLat:-1.5, maxLat:4.2, minLng:29.6, maxLng:35.0 },
  { cc:'SY', name:'Syria', minLat:32.3, maxLat:37.3, minLng:35.7, maxLng:42.4 },
  { cc:'TJ', name:'Tajikistan', minLat:36.7, maxLat:41.0, minLng:67.4, maxLng:75.2 },
  { cc:'NP', name:'Nepal', minLat:26.3, maxLat:30.5, minLng:80.1, maxLng:88.2 },
  { cc:'IS', name:'Iceland', minLat:63.4, maxLat:66.6, minLng:-24.5, maxLng:-13.5 },
  { cc:'GA', name:'Gabon', minLat:-3.9, maxLat:2.3, minLng:8.7, maxLng:14.5 },
  { cc:'GY', name:'Guyana', minLat:1.2, maxLat:8.6, minLng:-61.4, maxLng:-56.5 },
  { cc:'EC', name:'Ecuador', minLat:-5.0, maxLat:1.4, minLng:-80.9, maxLng:-75.2 },
  { cc:'CU', name:'Cuba', minLat:19.8, maxLat:23.2, minLng:-85.0, maxLng:-74.1 },
  { cc:'ER', name:'Eritrea', minLat:12.4, maxLat:18.0, minLng:36.4, maxLng:43.1 },
  { cc:'CI', name:'Ivory Coast', minLat:4.3, maxLat:10.7, minLng:-8.6, maxLng:-2.5 },
  { cc:'GN', name:'Guinea', minLat:7.2, maxLat:12.7, minLng:-15.1, maxLng:-7.6 },
  { cc:'KG', name:'Kyrgyzstan', minLat:39.2, maxLat:43.2, minLng:69.3, maxLng:80.3 },
  { cc:'RO', name:'Romania', minLat:43.6, maxLat:48.3, minLng:20.3, maxLng:29.7 },
  { cc:'BF', name:'Burkina Faso', minLat:9.4, maxLat:15.1, minLng:-5.5, maxLng:2.4 },
  { cc:'BY', name:'Belarus', minLat:51.3, maxLat:56.2, minLng:23.2, maxLng:32.8 },
  { cc:'SB', name:'Solomon Islands', minLat:-11.8, maxLat:-5.1, minLng:155.5, maxLng:162.7 },
  { cc:'BS', name:'Bahamas', minLat:20.9, maxLat:27.3, minLng:-80.5, maxLng:-72.7 },
  { cc:'ZW', name:'Zimbabwe', minLat:-22.4, maxLat:-15.6, minLng:25.2, maxLng:33.1 },
  { cc:'SC', name:'Seychelles', minLat:-9.8, maxLat:-4.3, minLng:46.2, maxLng:56.3 },
  { cc:'PL', name:'Poland', minLat:49.0, maxLat:54.8, minLng:14.1, maxLng:24.1 },
  { cc:'GR', name:'Greece', minLat:35.0, maxLat:41.7, minLng:19.4, maxLng:28.2 },
  { cc:'CG', name:'Rep. of Congo', minLat:-5.0, maxLat:3.7, minLng:11.2, maxLng:18.6 },
  { cc:'LA', name:'Laos', minLat:13.9, maxLat:22.5, minLng:100.1, maxLng:107.7 },
  { cc:'PG', name:'Papua New Guinea', minLat:-10.7, maxLat:0.0, minLng:140.8, maxLng:147.0 },
  { cc:'PY', name:'Paraguay', minLat:-27.6, maxLat:-19.3, minLng:-62.6, maxLng:-54.3 },
  { cc:'DE', name:'Germany', minLat:47.3, maxLat:55.1, minLng:5.9, maxLng:15.0 },
  { cc:'KE', name:'Kenya', minLat:-4.7, maxLat:4.6, minLng:34.0, maxLng:41.9 },
  { cc:'OM', name:'Oman', minLat:16.6, maxLat:26.4, minLng:51.9, maxLng:59.8 },
  { cc:'IQ', name:'Iraq', minLat:29.1, maxLat:37.4, minLng:38.8, maxLng:48.6 },
  { cc:'YE', name:'Yemen', minLat:12.1, maxLat:19.0, minLng:42.5, maxLng:55.0 },
  { cc:'BW', name:'Botswana', minLat:-26.9, maxLat:-17.8, minLng:19.9, maxLng:29.4 },
  { cc:'CM', name:'Cameroon', minLat:1.7, maxLat:13.1, minLng:8.5, maxLng:16.2 },
  { cc:'GB', name:'United Kingdom', minLat:49.9, maxLat:58.7, minLng:-8.2, maxLng:1.8 },
  { cc:'MG', name:'Madagascar', minLat:-25.6, maxLat:-11.9, minLng:43.2, maxLng:50.5 },
  { cc:'MA', name:'Morocco', minLat:27.7, maxLat:35.9, minLng:-13.2, maxLng:-1.0 },
  { cc:'SS', name:'South Sudan', minLat:3.5, maxLat:12.2, minLng:24.1, maxLng:35.9 },
  { cc:'ES', name:'Spain', minLat:35.9, maxLat:43.8, minLng:-9.3, maxLng:4.3 },
  { cc:'TM', name:'Turkmenistan', minLat:35.1, maxLat:42.8, minLng:52.4, maxLng:66.7 },
  { cc:'VN', name:'Vietnam', minLat:8.4, maxLat:23.4, minLng:102.1, maxLng:109.5 },
  { cc:'MH', name:'Marshall Islands', minLat:4.6, maxLat:14.6, minLng:160.8, maxLng:172.0 },
  { cc:'CF', name:'Central African Rep.', minLat:2.2, maxLat:11.0, minLng:14.4, maxLng:27.4 },
  { cc:'NG', name:'Nigeria', minLat:4.3, maxLat:13.9, minLng:2.7, maxLng:14.7 },
  { cc:'ZM', name:'Zambia', minLat:-18.1, maxLat:-8.2, minLng:21.9, maxLng:33.7 },
  { cc:'TR', name:'Turkey', minLat:35.8, maxLat:42.1, minLng:26.0, maxLng:44.8 },
  { cc:'FI', name:'Finland', minLat:59.8, maxLat:70.1, minLng:20.0, maxLng:31.6 },
  { cc:'TZ', name:'Tanzania', minLat:-11.7, maxLat:-0.9, minLng:29.3, maxLng:40.4 },
  { cc:'EG', name:'Egypt', minLat:22.0, maxLat:31.7, minLng:24.7, maxLng:37.1 },
  { cc:'TH', name:'Thailand', minLat:5.6, maxLat:20.5, minLng:97.3, maxLng:105.6 },
  { cc:'IT', name:'Italy', minLat:36.6, maxLat:47.1, minLng:6.6, maxLng:18.5 },
  { cc:'SO', name:'Somalia', minLat:0.0, maxLat:11.9, minLng:40.9, maxLng:51.4 },
  { cc:'ML', name:'Mali', minLat:10.1, maxLat:25.0, minLng:-4.2, maxLng:4.3 },
  { cc:'MY', name:'Malaysia', minLat:0.9, maxLat:7.4, minLng:99.6, maxLng:119.3 },
  { cc:'AF', name:'Afghanistan', minLat:29.4, maxLat:38.5, minLng:60.5, maxLng:74.9 },
  { cc:'MZ', name:'Mozambique', minLat:-26.9, maxLat:-10.5, minLng:32.4, maxLng:40.8 },
  { cc:'FR', name:'France', minLat:41.3, maxLat:51.1, minLng:-5.1, maxLng:9.6 },
  { cc:'UZ', name:'Uzbekistan', minLat:37.2, maxLat:45.6, minLng:55.9, maxLng:73.1 },
  { cc:'UA', name:'Ukraine', minLat:44.4, maxLat:52.4, minLng:22.1, maxLng:40.2 },
  { cc:'NZ', name:'New Zealand', minLat:-46.6, maxLat:-34.4, minLng:166.4, maxLng:178.6 },
  { cc:'MR', name:'Mauritania', minLat:14.7, maxLat:27.3, minLng:-17.1, maxLng:-4.8 },
  { cc:'VE', name:'Venezuela', minLat:0.6, maxLat:12.2, minLng:-73.4, maxLng:-59.8 },
  { cc:'PH', name:'Philippines', minLat:4.6, maxLat:20.9, minLng:116.9, maxLng:126.6 },
  { cc:'BO', name:'Bolivia', minLat:-22.9, maxLat:-9.7, minLng:-69.6, maxLng:-57.5 },
  { cc:'NA', name:'Namibia', minLat:-28.9, maxLat:-16.9, minLng:11.7, maxLng:25.3 },
  { cc:'MM', name:'Myanmar', minLat:9.8, maxLat:28.5, minLng:92.2, maxLng:101.2 },
  { cc:'AO', name:'Angola', minLat:-18.0, maxLat:-4.4, minLng:11.7, maxLng:24.1 },
  { cc:'TD', name:'Chad', minLat:7.4, maxLat:23.5, minLng:13.5, maxLng:24.0 },
  { cc:'ET', name:'Ethiopia', minLat:3.4, maxLat:14.9, minLng:33.0, maxLng:47.9 },
  { cc:'SE', name:'Sweden', minLat:55.3, maxLat:69.1, minLng:11.1, maxLng:24.2 },
  { cc:'NE', name:'Niger', minLat:11.7, maxLat:23.5, minLng:0.2, maxLng:16.0 },
  { cc:'CO', name:'Colombia', minLat:-4.2, maxLat:12.5, minLng:-79.0, maxLng:-66.8 },
  { cc:'ZA', name:'South Africa', minLat:-34.8, maxLat:-22.1, minLng:16.5, maxLng:32.9 },
  { cc:'LY', name:'Libya', minLat:19.5, maxLat:33.2, minLng:9.3, maxLng:25.2 },
  { cc:'PK', name:'Pakistan', minLat:23.7, maxLat:37.1, minLng:60.9, maxLng:77.8 },
  { cc:'SD', name:'Sudan', minLat:8.7, maxLat:22.2, minLng:21.8, maxLng:38.6 },
  { cc:'FM', name:'Micronesia', minLat:1.0, maxLat:10.1, minLng:138.1, maxLng:163.1 },
  { cc:'PE', name:'Peru', minLat:-18.4, maxLat:0.0, minLng:-81.3, maxLng:-68.7 },
  { cc:'IR', name:'Iran', minLat:25.1, maxLat:39.8, minLng:44.0, maxLng:63.3 },
  { cc:'PF', name:'French Polynesia', minLat:-27.8, maxLat:-7.9, minLng:-148.9, maxLng:-134.5 },
  { cc:'SA', name:'Saudi Arabia', minLat:16.4, maxLat:32.2, minLng:34.5, maxLng:55.7 },
  { cc:'MN', name:'Mongolia', minLat:41.6, maxLat:52.1, minLng:87.7, maxLng:119.9 },
  { cc:'NO', name:'Norway', minLat:57.9, maxLat:71.2, minLng:4.6, maxLng:31.1 },
  { cc:'CL', name:'Chile', minLat:-55.9, maxLat:-17.5, minLng:-75.7, maxLng:-66.4 },
  { cc:'CD', name:'DR Congo', minLat:-13.5, maxLat:5.4, minLng:12.2, maxLng:31.3 },
  { cc:'DZ', name:'Algeria', minLat:18.9, maxLat:37.1, minLng:-8.7, maxLng:12.0 },
  { cc:'JP', name:'Japan', minLat:24.4, maxLat:45.5, minLng:122.9, maxLng:145.8 },
  { cc:'KZ', name:'Kazakhstan', minLat:40.6, maxLat:55.4, minLng:50.3, maxLng:87.4 },
  { cc:'MX', name:'Mexico', minLat:14.5, maxLat:32.7, minLng:-117.1, maxLng:-86.7 },
  { cc:'AR', name:'Argentina', minLat:-55.1, maxLat:-21.8, minLng:-73.6, maxLng:-53.6 },
  { cc:'ID', name:'Indonesia', minLat:-10.9, maxLat:5.9, minLng:95.0, maxLng:141.0 },
  { cc:'IN', name:'India', minLat:6.7, maxLat:35.5, minLng:68.1, maxLng:97.4 },
  { cc:'AU', name:'Australia', minLat:-43.6, maxLat:-10.7, minLng:113.3, maxLng:153.6 },
  { cc:'US', name:'United States', minLat:24.5, maxLat:49.4, minLng:-125.0, maxLng:-66.9 },
  { cc:'BR', name:'Brazil', minLat:-33.7, maxLat:5.3, minLng:-73.9, maxLng:-34.7 },
  { cc:'CN', name:'China', minLat:18.2, maxLat:53.6, minLng:73.5, maxLng:134.8 },
  { cc:'CA', name:'Canada', minLat:41.7, maxLat:83.1, minLng:-141.0, maxLng:-52.6 },
  { cc:'RU', name:'Russia', minLat:41.2, maxLat:81.8, minLng:19.6, maxLng:180.0 },
];

// US states for region detection
const US_STATES = [
  { code:'AL', name:'Alabama',       minLat:30.1, maxLat:35.0, minLng:-88.5, maxLng:-84.9 },
  { code:'AK', name:'Alaska',        minLat:54.0, maxLat:71.5, minLng:-168.0,maxLng:-130.0},
  { code:'AZ', name:'Arizona',       minLat:31.3, maxLat:37.0, minLng:-114.8, maxLng:-109.0},
  { code:'AR', name:'Arkansas',      minLat:33.0, maxLat:36.5, minLng:-94.6, maxLng:-89.6 },
  { code:'CA', name:'California',    minLat:32.5, maxLat:42.0, minLng:-124.4, maxLng:-114.1},
  { code:'CO', name:'Colorado',      minLat:37.0, maxLat:41.0, minLng:-109.0, maxLng:-102.0},
  { code:'CT', name:'Connecticut',   minLat:40.9, maxLat:42.1, minLng:-73.7, maxLng:-71.8 },
  { code:'DE', name:'Delaware',      minLat:38.4, maxLat:39.8, minLng:-75.8, maxLng:-75.0 },
  { code:'FL', name:'Florida',       minLat:24.4, maxLat:31.0, minLng:-87.6, maxLng:-80.0 },
  { code:'GA', name:'Georgia',       minLat:30.4, maxLat:35.0, minLng:-85.6, maxLng:-80.8 },
  { code:'HI', name:'Hawaii',        minLat:18.9, maxLat:22.2, minLng:-160.2, maxLng:-154.8},
  { code:'ID', name:'Idaho',         minLat:42.0, maxLat:49.0, minLng:-117.2, maxLng:-111.0},
  { code:'IL', name:'Illinois',      minLat:36.9, maxLat:42.5, minLng:-91.5, maxLng:-87.5 },
  { code:'IN', name:'Indiana',       minLat:37.8, maxLat:41.8, minLng:-88.1, maxLng:-84.8 },
  { code:'IA', name:'Iowa',          minLat:40.4, maxLat:43.5, minLng:-96.6, maxLng:-90.1 },
  { code:'KS', name:'Kansas',        minLat:37.0, maxLat:40.0, minLng:-102.1, maxLng:-94.6 },
  { code:'KY', name:'Kentucky',      minLat:36.5, maxLat:39.1, minLng:-89.6, maxLng:-81.9 },
  { code:'LA', name:'Louisiana',     minLat:28.9, maxLat:33.0, minLng:-94.1, maxLng:-89.0 },
  { code:'ME', name:'Maine',         minLat:43.1, maxLat:47.5, minLng:-71.1, maxLng:-67.0 },
  { code:'MD', name:'Maryland',      minLat:37.9, maxLat:39.7, minLng:-79.5, maxLng:-75.0 },
  { code:'MA', name:'Massachusetts', minLat:41.2, maxLat:42.9, minLng:-73.5, maxLng:-69.9 },
  { code:'MI', name:'Michigan',      minLat:41.7, maxLat:48.3, minLng:-90.4, maxLng:-82.4 },
  { code:'MN', name:'Minnesota',     minLat:43.5, maxLat:49.4, minLng:-97.2, maxLng:-89.5 },
  { code:'MS', name:'Mississippi',   minLat:30.2, maxLat:35.0, minLng:-91.7, maxLng:-88.1 },
  { code:'MO', name:'Missouri',      minLat:35.9, maxLat:40.6, minLng:-95.8, maxLng:-89.1 },
  { code:'MT', name:'Montana',       minLat:44.4, maxLat:49.0, minLng:-116.0, maxLng:-104.0},
  { code:'NE', name:'Nebraska',      minLat:40.0, maxLat:43.0, minLng:-104.1, maxLng:-95.3 },
  { code:'NV', name:'Nevada',        minLat:35.0, maxLat:42.0, minLng:-120.0, maxLng:-114.0},
  { code:'NH', name:'New Hampshire', minLat:42.7, maxLat:45.3, minLng:-72.6, maxLng:-70.7 },
  { code:'NJ', name:'New Jersey',    minLat:38.9, maxLat:41.4, minLng:-75.6, maxLng:-73.9 },
  { code:'NM', name:'New Mexico',    minLat:31.3, maxLat:37.0, minLng:-109.0, maxLng:-103.0},
  { code:'NY', name:'New York',      minLat:40.5, maxLat:45.0, minLng:-79.8, maxLng:-71.9 },
  { code:'NC', name:'N. Carolina',   minLat:33.8, maxLat:36.6, minLng:-84.3, maxLng:-75.5 },
  { code:'ND', name:'North Dakota',  minLat:45.9, maxLat:49.0, minLng:-104.0, maxLng:-96.6 },
  { code:'OH', name:'Ohio',          minLat:38.4, maxLat:42.3, minLng:-84.8, maxLng:-80.5 },
  { code:'OK', name:'Oklahoma',      minLat:33.6, maxLat:37.0, minLng:-103.0, maxLng:-94.4 },
  { code:'OR', name:'Oregon',        minLat:41.9, maxLat:46.3, minLng:-124.6, maxLng:-116.5},
  { code:'PA', name:'Pennsylvania',  minLat:39.7, maxLat:42.3, minLng:-80.5, maxLng:-74.7 },
  { code:'RI', name:'Rhode Island',  minLat:41.1, maxLat:42.0, minLng:-71.9, maxLng:-71.1 },
  { code:'SC', name:'S. Carolina',   minLat:32.0, maxLat:35.2, minLng:-83.4, maxLng:-78.5 },
  { code:'SD', name:'South Dakota',  minLat:42.5, maxLat:45.9, minLng:-104.1, maxLng:-96.4 },
  { code:'TN', name:'Tennessee',     minLat:34.9, maxLat:36.7, minLng:-90.3, maxLng:-81.7 },
  { code:'TX', name:'Texas',         minLat:25.8, maxLat:36.5, minLng:-106.6, maxLng:-93.5 },
  { code:'UT', name:'Utah',          minLat:37.0, maxLat:42.0, minLng:-114.1, maxLng:-109.0},
  { code:'VT', name:'Vermont',       minLat:42.7, maxLat:45.0, minLng:-73.4, maxLng:-71.5 },
  { code:'VA', name:'Virginia',      minLat:36.5, maxLat:39.5, minLng:-83.7, maxLng:-75.2 },
  { code:'WA', name:'Washington',    minLat:45.5, maxLat:49.0, minLng:-124.7, maxLng:-116.9},
  { code:'WV', name:'W. Virginia',   minLat:37.2, maxLat:40.6, minLng:-82.6, maxLng:-77.7 },
  { code:'WI', name:'Wisconsin',     minLat:42.5, maxLat:47.1, minLng:-92.9, maxLng:-86.8 },
  { code:'WY', name:'Wyoming',       minLat:41.0, maxLat:45.0, minLng:-111.1, maxLng:-104.0},
  { code:'DC', name:'Washington DC', minLat:38.8, maxLat:39.0, minLng:-77.1, maxLng:-76.9 },
];

// UK regions
const UK_REGIONS = [
  { code:'LON', name:'London',        minLat:51.3, maxLat:51.7, minLng:-0.5,  maxLng: 0.3  },
  { code:'ENG', name:'England',       minLat:49.9, maxLat:55.8, minLng:-6.4,  maxLng: 1.8  },
  { code:'SCT', name:'Scotland',      minLat:54.6, maxLat:60.9, minLng:-7.6,  maxLng:-0.7  },
  { code:'WLS', name:'Wales',         minLat:51.3, maxLat:53.4, minLng:-5.4,  maxLng:-2.6  },
  { code:'NIR', name:'N. Ireland',    minLat:54.0, maxLat:55.3, minLng:-8.2,  maxLng:-5.4  },
];

// Canada provinces
const CA_PROVINCES = [
  { code:'ON',  name:'Ontario',        minLat:41.7, maxLat:56.9, minLng:-95.2, maxLng:-74.3 },
  { code:'QC',  name:'Quebec',         minLat:44.9, maxLat:62.6, minLng:-79.8, maxLng:-57.1 },
  { code:'BC',  name:'British Columbia',minLat:48.3,maxLat:60.0, minLng:-139.1,maxLng:-114.0},
  { code:'AB',  name:'Alberta',        minLat:49.0, maxLat:60.0, minLng:-120.0,maxLng:-110.0},
  { code:'MB',  name:'Manitoba',       minLat:49.0, maxLat:60.0, minLng:-102.0,maxLng:-95.2 },
  { code:'SK',  name:'Saskatchewan',   minLat:49.0, maxLat:60.0, minLng:-110.0,maxLng:-101.4},
  { code:'NS',  name:'Nova Scotia',    minLat:43.4, maxLat:47.0, minLng:-66.3, maxLng:-59.7 },
  { code:'NB',  name:'New Brunswick',  minLat:44.6, maxLat:48.1, minLng:-69.1, maxLng:-63.8 },
  { code:'NL',  name:'Newfoundland',   minLat:46.6, maxLat:60.4, minLng:-67.8, maxLng:-52.6 },
];

function detectCountry(lat, lng) {
  // Check Grenada first (small island, needs priority)
  const gd = COUNTRY_DB.find(c => c.cc === 'GD');
  if (lat >= gd.minLat && lat <= gd.maxLat && lng >= gd.minLng && lng <= gd.maxLng) {
    return gd;
  }
  return COUNTRY_DB.find(c =>
    lat >= c.minLat && lat <= c.maxLat && lng >= c.minLng && lng <= c.maxLng
  ) || null;
}

function detectRegion(lat, lng, countryCode) {
  if (countryCode === 'GD') {
    return detectGrenadaParish(lat, lng);
  }
  if (countryCode === 'US') {
    const s = US_STATES.find(s => lat >= s.minLat && lat <= s.maxLat && lng >= s.minLng && lng <= s.maxLng);
    return s ? { code: s.code, name: s.name } : { code: 'USA', name: 'United States' };
  }
  if (countryCode === 'GB') {
    const r = UK_REGIONS.find(r => lat >= r.minLat && lat <= r.maxLat && lng >= r.minLng && lng <= r.maxLng);
    return r ? { code: r.code, name: r.name } : { code: 'GBR', name: 'United Kingdom' };
  }
  if (countryCode === 'CA') {
    const p = CA_PROVINCES.find(p => lat >= p.minLat && lat <= p.maxLat && lng >= p.minLng && lng <= p.maxLng);
    return p ? { code: p.code, name: p.name } : { code: 'CAN', name: 'Canada' };
  }
  // All other countries: use country code as 3-char region padded
  const country = COUNTRY_DB.find(c => c.cc === countryCode);
  const regionCode = (countryCode + 'X').substring(0, 3);
  return { code: regionCode, name: country ? country.name : countryCode };
}

function getLocationInfo(lat, lng) {
  const country = detectCountry(lat, lng);
  if (!country) {
    // Ocean or unmapped — use coordinates to make a code
    return { countryCode: 'XX', regionCode: 'OCN', regionName: 'International Waters' };
  }
  const region = detectRegion(lat, lng, country.cc);
  return { countryCode: country.cc, regionCode: region.code, regionName: region.name };
}

// ============================================================
// STATE
// ============================================================

let map            = null;
let marker         = null;
let infoWindow     = null;
let lastClick      = null;
let parishBoxes    = [];
let currentCode    = null;
let currentLat     = null;
let currentLng     = null;
let currentRegion  = null;
let currentMapsUrl = null;

// ============================================================
// MAP INITIALISATION
// ============================================================

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: GRENADA_CENTER,
    zoom: DEFAULT_ZOOM,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      position: google.maps.ControlPosition.TOP_RIGHT,
      mapTypeIds: [
        google.maps.MapTypeId.ROADMAP,
        google.maps.MapTypeId.SATELLITE,
        google.maps.MapTypeId.HYBRID,
        google.maps.MapTypeId.TERRAIN
      ]
    },
    zoomControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    styles: [
      { elementType: 'geometry',            stylers: [{ color: '#1e2d44' }] },
      { elementType: 'labels.text.stroke',  stylers: [{ color: '#0c1220' }] },
      { elementType: 'labels.text.fill',    stylers: [{ color: '#e8eef6' }] },
      { featureType: 'water', elementType: 'geometry',          stylers: [{ color: '#0c1a2e' }] },
      { featureType: 'water', elementType: 'labels.text.fill',  stylers: [{ color: '#7a92b4' }] },
      { featureType: 'road',  elementType: 'geometry',          stylers: [{ color: '#243450' }] },
      { featureType: 'road',  elementType: 'geometry.stroke',   stylers: [{ color: '#141e30' }] },
      { featureType: 'road.highway', elementType: 'geometry',        stylers: [{ color: '#f0a500' }] },
      { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0c1220' }] },
      { featureType: 'poi',       elementType: 'geometry', stylers: [{ color: '#1e2d44' }] },
      { featureType: 'poi.park',  elementType: 'geometry', stylers: [{ color: '#1a3a2a' }] },
      { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#f0a500' }] }
    ]
  });

  infoWindow = new google.maps.InfoWindow();
  map.addListener('click', handleMapClick);
  drawParishBoxes();

  console.log('%cDAC – Digital Address Codes v3.0 — Global CC-PPP-XXXXXX Format', 'color:#f0a500;font-weight:bold;font-size:14px;');
}

function drawParishBoxes() {
  const colors = ['#f0a500', '#3abf9e', '#e85d3a', '#7b9acc', '#b8a9f0', '#f0c86e'];
  PARISHES.forEach((parish, i) => {
    const { minLat, maxLat, minLng, maxLng } = parish.bbox;
    const rect = new google.maps.Rectangle({
      bounds: { north: maxLat, south: minLat, east: maxLng, west: minLng },
      map,
      strokeColor: colors[i % colors.length],
      strokeOpacity: 0.7,
      strokeWeight: 1.5,
      fillColor: colors[i % colors.length],
      fillOpacity: 0.06
    });
    rect.addListener('mouseover', (e) => {
      infoWindow.setContent(`<div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:#0c1220;padding:4px 8px;background:#ffffff;border-radius:4px;"><strong>${parish.code}</strong><br>${parish.name}</div>`);
      infoWindow.setPosition(e.latLng);
      infoWindow.open(map);
    });
    rect.addListener('mouseout', () => infoWindow.close());
    rect.addListener('click', handleMapClick);
    parishBoxes.push(rect);
  });
}

// ============================================================
// MAP CLICK HANDLER
// ============================================================

function handleMapClick(e) {
  const lat = e.latLng.lat();
  const lng = e.latLng.lng();
  lastClick = { lat, lng };

  const { countryCode, regionCode, regionName } = getLocationInfo(lat, lng);

  const region  = { code: regionCode, name: regionName };
  const code    = getOrCreateLocationCode(lat, lng, region, countryCode);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  currentRegion = region;

  placeMarker(lat, lng, code, region);
  generateQRCode(mapsUrl);
  updateUI({ code, lat, lng, region, countryCode, mapsUrl });
  updateStreetView(lat, lng);
}

// ============================================================
// STREET VIEW
// ============================================================

function updateStreetView(lat, lng) {
  const svPanel     = document.getElementById('sv-panel');
  const svDiv       = document.getElementById('street-view');
  const svUnavail   = document.getElementById('sv-unavailable');
  const svLoading   = document.getElementById('sv-loading');
  const svStatus    = document.getElementById('sv-status');

  // Reset state
  svDiv.classList.remove('visible');
  svUnavail.style.display = 'none';
  svLoading.style.display = 'flex';
  svStatus.className = 'sv-status';
  svStatus.textContent = 'Loading…';
  streetViewStaticUrl = '';

  const svService = new google.maps.StreetViewService();
  const searchRadius = 50; // metres

  svService.getPanorama(
    { location: { lat, lng }, radius: searchRadius, preference: google.maps.StreetViewPreference.NEAREST },
    (data, status) => {
      svLoading.style.display = 'none';

      if (status === google.maps.StreetViewStatus.OK) {
        const panoLat = data.location.latLng.lat();
        const panoLng = data.location.latLng.lng();

        // Build static Street View URL for layouts
        streetViewStaticUrl =
          `https://maps.googleapis.com/maps/api/streetview`
          + `?size=640x320`
          + `&location=${panoLat},${panoLng}`
          + `&fov=90&heading=0&pitch=0`
          + `&key=${MAPS_API_KEY}`;

        // Init or move live panorama
        if (!streetViewPanorama) {
          svDiv.classList.add('visible');
          streetViewPanorama = new google.maps.StreetViewPanorama(svDiv, {
            position: { lat: panoLat, lng: panoLng },
            pov: { heading: 0, pitch: 0 },
            zoom: 1,
            addressControl: false,
            fullscreenControl: true,
            motionTracking: false
          });
        } else {
          svDiv.classList.add('visible');
          streetViewPanorama.setPosition({ lat: panoLat, lng: panoLng });
          streetViewPanorama.setPov({ heading: 0, pitch: 0 });
        }

        svStatus.className = 'sv-status available';
        svStatus.textContent = '✓ Street View available';
      } else {
        svUnavail.style.display = 'flex';
        svStatus.className = 'sv-status unavailable';
        svStatus.textContent = 'Street View not available at this address';
        streetViewStaticUrl = '';
      }
    }
  );
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
    `<div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:#0c1220;padding:6px 8px;line-height:1.6;background:#ffffff;border-radius:6px;">
      <strong style="font-size:14px;color:#0c1220;">${code}</strong><br>
      ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
      <em style="color:#444;">${region.name}</em>
    </div>`
  );
  infoWindow.open(map, marker);
}

// ============================================================
// QR CODE GENERATION
// ============================================================

function generateQRCode(url) {
  const wrapper     = document.getElementById('qr-wrapper');
  const placeholder = wrapper.querySelector('.qr-placeholder');
  const canvas      = document.getElementById('qr-canvas');

  if (placeholder) placeholder.style.display = 'none';
  canvas.style.display = 'none';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const existingQR = wrapper.querySelector('.qr-generated');
  if (existingQR) existingQR.remove();

  const tempDiv = document.createElement('div');
  tempDiv.className = 'qr-generated';
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
      canvas.width  = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      ctx.drawImage(sourceCanvas, 0, 0);
      canvas.style.display = 'block';
    } else {
      const sourceImg = tempDiv.querySelector('img');
      if (sourceImg) {
        canvas.style.display = 'none';
        const displayImg = document.createElement('img');
        displayImg.src = sourceImg.src;
        displayImg.id  = 'qr-img';
        displayImg.style.cssText = 'border-radius:6px;border:3px solid #f0a500;padding:8px;background:white;max-width:100%;';
        displayImg.className = 'qr-generated';
        const oldImg = wrapper.querySelector('#qr-img');
        if (oldImg) oldImg.remove();
        wrapper.appendChild(displayImg);
      }
    }
    tempDiv.remove();
  }, 100);
}

// ============================================================
// UI HELPERS
// ============================================================

function updateUI(data) {
  currentCode    = data.code;
  currentLat     = data.lat;
  currentLng     = data.lng;
  currentMapsUrl = data.mapsUrl;

  const codeEl = document.getElementById('location-code');
  codeEl.textContent = data.code;
  codeEl.classList.remove('updated');
  void codeEl.offsetWidth;
  codeEl.classList.add('updated');

  document.getElementById('coord-display').textContent =
    `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`;

  document.getElementById('parish-display').textContent =
    `${data.region.name} (${data.countryCode}-${data.region.code})`;

  ['btn-download','btn-print','btn-share','btn-layout'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.disabled = false; b.style.display = ''; }
  });

  const { gridX, gridY, latMeters, lngMeters } = calcGridDebug(data.lat, data.lng);
  document.getElementById('dbg-gx').textContent  = gridX;
  document.getElementById('dbg-gy').textContent  = gridY;
  document.getElementById('dbg-lm').textContent  = latMeters.toFixed(2) + ' m';
  document.getElementById('dbg-nm').textContent  = lngMeters.toFixed(2) + ' m';
  document.getElementById('dbg-par').textContent = `${data.countryCode}-${data.region.code} – ${data.region.name}`;
}

function calcGridDebug(lat, lng) {
  const latMeters = Math.abs(lat) * LAT_TO_METERS;
  const lngMeters = Math.abs(lng) * LNG_TO_METERS;
  return {
    gridX: Math.floor(latMeters / GRID_SIZE),
    gridY: Math.floor(lngMeters / GRID_SIZE),
    latMeters,
    lngMeters
  };
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ============================================================
// SEARCH
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const btnSearch   = document.getElementById('btn-search');
  const inputSearch = document.getElementById('code-search');
  if (!btnSearch || !inputSearch) return;

  function doSearch() {
    const code = inputSearch.value.trim().toUpperCase();
    if (!code) return;

    const entry = lookupCodeInRegistry(code);
    if (entry) {
      const lat     = entry.lat;
      const lng     = entry.lng;
      const region  = { code: entry.parish, name: entry.parishName };
      const country = entry.country || 'GD';
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

      map.panTo({ lat, lng });
      map.setZoom(18);
      currentRegion = region;
      placeMarker(lat, lng, code, region);
      generateQRCode(mapsUrl);
      updateUI({ code, lat, lng, region, countryCode: country, mapsUrl });
      updateStreetView(lat, lng);
      showToast(`Loaded: ${code}`);
    } else {
      showToast('Code not found in local registry');
    }
  }

  btnSearch.onclick = doSearch;
  inputSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
});

// ============================================================
// DOWNLOAD QR
// ============================================================

document.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-download') return;
  const canvas = document.getElementById('qr-canvas');
  const img    = document.getElementById('qr-img');
  let url = null;
  if (canvas && canvas.style.display !== 'none') url = canvas.toDataURL('image/png');
  else if (img) url = img.src;
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = (currentCode || 'dac') + '-qr.png';
  link.click();
  showToast('QR downloaded');
});

// ============================================================
// PRINT STICKER
// ============================================================

document.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-print') return;
  const canvas = document.getElementById('qr-canvas');
  const img    = document.getElementById('qr-img');
  let url = null;
  if (canvas && canvas.style.display !== 'none') url = canvas.toDataURL('image/png');
  else if (img) url = img.src;
  if (!url) return;

  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>DAC Sticker - ${currentCode}</title>
    <style>
      body{font-family:'Courier New',monospace;text-align:center;padding:20px;background:#fff;}
      .card{border:2px solid #000;padding:20px;display:inline-block;border-radius:8px;}
      .logo{font-size:22px;font-weight:900;letter-spacing:0.1em;color:#0c1220;}
      .code{font-size:28px;font-weight:700;color:#c87700;letter-spacing:0.08em;margin:8px 0;}
      img{width:180px;display:block;margin:12px auto;}
      .sub{font-size:11px;color:#555;}
      .flag{font-size:28px;}
    </style></head>
    <body onload="window.print()">
      <div class="card">
        <div class="flag">&#127468;&#127465;</div>
        <div class="logo">DAC</div>
        <div class="sub" style="font-size:10px;color:#888;letter-spacing:0.08em;">DIGITAL ADDRESS CODES</div>
        <div class="code">${currentCode}</div>
        <img src="${url}" alt="QR Code">
        <div class="sub">${currentLat ? currentLat.toFixed(6) : ''}, ${currentLng ? currentLng.toFixed(6) : ''}</div>
        <div class="sub">Scan for directions</div>
      </div>
    </body></html>
  `);
});

// ============================================================
// SHARE
// ============================================================

document.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-share') return;
  if (!currentMapsUrl) return;
  const text = `My DAC Address Code: ${currentCode} - ${currentMapsUrl}`;
  if (navigator.share) {
    navigator.share({ title: 'DAC – Digital Address Codes', text, url: currentMapsUrl });
  } else {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
});

// ============================================================
// PAYMENT HELPERS
// ============================================================

const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/fZu3cp19C4PN10z0Ot5wI00';
const SUCCESS_URL          = 'https://dacgrenada.github.io/Dac/success.html';
const PAID_PREFIX          = 'dac_paid_';

function markCodeAsPaid(code) {
  try { localStorage.setItem(PAID_PREFIX + code, '1'); } catch {}
}

function isCodePaid(code) {
  try { return localStorage.getItem(PAID_PREFIX + code) === '1'; } catch { return false; }
}

function saveCurrentCodeForPayment(code) {
  try { localStorage.setItem('dac_pending_payment_code', code); } catch {}
}

// ============================================================
// PROPERTY LAYOUT GENERATOR
// ============================================================

function generatePropertyLayout(isPaid = false) {
  if (!currentCode || currentLat === null) {
    showToast('Pin a property first');
    return;
  }

  showToast(isPaid ? 'Opening clean layout…' : 'Generating preview…');

  const lat  = currentLat.toFixed(7);
  const lng  = currentLng.toFixed(7);
  const zoom = 19;

  // scale=2 → doubles actual pixel output (640x400 renders at 1280x800px) — crisp for print
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap`
    + `?center=${lat},${lng}`
    + `&zoom=${zoom}`
    + `&size=640x400`
    + `&scale=2`
    + `&maptype=satellite`
    + `&markers=color:0xf0a500%7Csize:mid%7C${lat},${lng}`
    + `&key=${MAPS_API_KEY}`;

  // Street View static image (captured at time of pin)
  const svStaticUrl = streetViewStaticUrl || '';

  const regionName = currentRegion ? currentRegion.name : '-';
  const dateStr    = new Date().toLocaleDateString('en-GD', { year: 'numeric', month: 'long', day: 'numeric' });

  // Get QR code image from existing canvas/img in page
  let qrDataUrl = '';
  const qrCanvas = document.getElementById('qr-canvas');
  const qrImg    = document.getElementById('qr-img');
  if (qrCanvas && qrCanvas.style.display !== 'none') {
    qrDataUrl = qrCanvas.toDataURL('image/png');
  } else if (qrImg) {
    qrDataUrl = qrImg.src;
  }

  const watermarkHtml = !isPaid ? `
    <div class="watermark" id="wm-overlay">
      <div class="wm-text">PREVIEW ONLY</div>
      <div class="wm-sub">PAYMENT REQUIRED</div>
    </div>` : '';

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>DAC Property Layout – ${currentCode}</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;800&family=IBM+Plex+Mono:wght@400;600&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0c1220;
      color: #e8eef6;
      font-family: 'DM Sans', sans-serif;
      padding: 24px;
      min-height: 100vh;
    }
    .layout-card {
      background: #141e30;
      border: 2px solid #f0a500;
      border-radius: 12px;
      overflow: hidden;
      max-width: 860px;
      margin: 0 auto;
      position: relative;
    }

    /* ── Header ── */
    .layout-header {
      background: #0c1220;
      border-bottom: 2px solid #f0a500;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header-left .logo {
      font-family: 'Syne', sans-serif;
      font-size: 28px;
      font-weight: 800;
      color: #f0a500;
      letter-spacing: 0.06em;
      line-height: 1;
    }
    .header-left .logo-sub {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 9px;
      color: #7a92b4;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      margin-top: 3px;
    }
    .header-right { text-align: right; }
    .header-right .code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: 0.08em;
    }
    .header-right .code-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 9px;
      color: #7a92b4;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 3px;
    }

    /* ── Satellite Image ── */
    .satellite-wrap {
      position: relative;
      width: 100%;
      background: #1e2d44;
      border-bottom: 1px solid #243450;
      line-height: 0;
      min-height: 180px;
    }
    .satellite-wrap img.sat-img {
      width: 100%;
      display: block;
      max-height: 320px;
      object-fit: cover;
    }
    .sat-img-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 220px;
      color: #7a92b4;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      letter-spacing: 0.08em;
      flex-direction: column;
      gap: 10px;
    }
    .sat-img-error {
      display: none;
      align-items: center;
      justify-content: center;
      min-height: 180px;
      background: #1a2a3a;
      color: #e85d3a;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
      flex-direction: column;
      gap: 8px;
      padding: 20px;
      text-align: center;
    }
    .sat-label {
      position: absolute;
      top: 10px;
      left: 12px;
      background: rgba(12,18,32,0.82);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px;
      color: #f0a500;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid rgba(240,165,0,0.4);
      letter-spacing: 0.08em;
    }
    .sat-coords {
      position: absolute;
      bottom: 10px;
      right: 12px;
      background: rgba(12,18,32,0.82);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 9px;
      color: #e8eef6;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.1);
      letter-spacing: 0.06em;
    }

    /* ── Street View Image ── */
    .sv-wrap {
      position: relative;
      width: 100%;
      background: #1e2d44;
      border-bottom: 1px solid #243450;
      line-height: 0;
      min-height: 80px;
    }
    .sv-wrap img.sv-img {
      width: 100%;
      display: block;
      max-height: 200px;
      object-fit: cover;
      object-fit: fill;
    }
    .sv-img-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 120px;
      color: #7a92b4;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      gap: 10px;
      letter-spacing: 0.08em;
    }
    .sv-label-overlay {
      position: absolute;
      top: 10px;
      left: 12px;
      background: rgba(12,18,32,0.82);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px;
      color: #3abf9e;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid rgba(58,191,158,0.4);
      letter-spacing: 0.08em;
    }


    .info-row {
      display: flex;
      align-items: stretch;
      border-top: 1px solid #243450;
    }
    .info-fields {
      flex: 1;
      padding: 18px 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 24px;
    }
    .field { }
    .field-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #7a92b4;
      margin-bottom: 3px;
    }
    .field-value {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
      color: #e8eef6;
      font-weight: 600;
      word-break: break-all;
    }
    .field-value.highlight { color: #f0a500; font-size: 15px; }
    .field-value.seafoam   { color: #3abf9e; }

    /* ── QR Panel ── */
    .qr-panel {
      padding: 14px 20px;
      border-left: 1px solid #243450;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: 130px;
    }
    .qr-panel img {
      width: 100px;
      height: 100px;
      border: 3px solid #f0a500;
      border-radius: 6px;
      padding: 4px;
      background: #fff;
      display: block;
    }
    .qr-panel .qr-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 8px;
      color: #7a92b4;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      text-align: center;
    }

    /* ── Footer ── */
    .layout-footer {
      background: #0c1220;
      border-top: 1px solid #243450;
      padding: 8px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .layout-footer span {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 9px;
      color: #7a92b4;
      letter-spacing: 0.08em;
    }

    /* ── Watermark ── */
    .watermark {
      position: fixed;
      top: 0; left: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      text-align: center;
      opacity: 0.55;
      z-index: 9999;
      transform: rotate(-30deg);
    }
    .wm-text {
      font-family: 'Syne', sans-serif;
      font-size: 80px;
      font-weight: 800;
      color: #ff0000;
      white-space: nowrap;
      letter-spacing: 0.06em;
      text-shadow:
        0 0 20px rgba(255,0,0,0.9),
        2px 2px 0px #000,
        -2px -2px 0px #000,
        2px -2px 0px #000,
        -2px 2px 0px #000;
      -webkit-text-stroke: 2px #000;
    }
    .wm-sub {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 34px;
      font-weight: 700;
      color: #f0a500;
      white-space: nowrap;
      letter-spacing: 0.14em;
      text-shadow:
        0 0 16px rgba(240,165,0,0.9),
        2px 2px 0px #000,
        -2px -2px 0px #000;
      -webkit-text-stroke: 1px #000;
    }
    @media print {
      .watermark {
        position: fixed !important;
        opacity: 0.65 !important;
      }
    }

    /* ── Print ── */
    @keyframes spin { to { transform: rotate(360deg); } }
    @page { size: A4 landscape; margin: 8mm; }
    @media print {
      html, body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
      body { display: block !important; color: #000 !important; }
      .no-print, #pay-bar { display: none !important; }
      .layout-card {
        border: 2px solid #c87700 !important;
        max-width: 100% !important;
        width: 100% !important;
        page-break-inside: avoid;
        break-inside: avoid;
        background: #fff !important;
      }
      .layout-header { background: #f5f5f5 !important; border-color: #c87700 !important; }
      .logo { color: #c87700 !important; }
      .header-right .code { color: #333 !important; }
      .layout-footer { background: #f5f5f5 !important; border-color: #ddd !important; }
      .info-fields { background: #fff !important; }
      .field-value { color: #222 !important; }
      .field-value.highlight { color: #c87700 !important; }
      .field-value.seafoam { color: #2a9d7e !important; }
      .field-label { color: #666 !important; }
      .qr-panel { border-color: #ddd !important; }
      .layout-footer span { color: #555 !important; }
      .satellite-wrap img, .sv-wrap img { max-height: 260px !important; }
      ${!isPaid ? `
      .watermark { opacity: 0.35 !important; display: flex !important; }
      body * { visibility: hidden !important; }
      .watermark, .watermark * { visibility: visible !important; }
      ` : ''}
    }
    .print-btn {
      display: block;
      margin: 18px auto 0;
      padding: 10px 32px;
      background: #f0a500;
      color: #0c1220;
      font-family: 'Syne', sans-serif;
      font-size: 15px;
      font-weight: 700;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      letter-spacing: 0.04em;
    }
    .print-btn:hover { background: #ffbe33; }
    </style>
    ${!isPaid ? `<style id="print-block-style">
      @media print {
        body * { visibility: hidden !important; }
        .watermark, .watermark * { visibility: visible !important; }
      }
    </style>` : ''}
<body>

<div class="layout-card">

  ${watermarkHtml}

  <!-- Header -->
  <div class="layout-header">
    <div class="header-left">
      <div class="logo">DAC</div>
      <div class="logo-sub">Digital Address Codes</div>
    </div>
    <div class="header-right">
      <div class="code">${currentCode}</div>
      <div class="code-label">DAC Address Code</div>
    </div>
  </div>

  <!-- Satellite Image -->
  <div class="satellite-wrap" id="sat-wrap">
    <div class="sat-img-loading" id="sat-loading">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f0a500" stroke-width="1.5" style="animation:spin 1.2s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      Loading satellite image…
    </div>
    <div class="sat-img-error" id="sat-error">
      ⚠ Satellite image could not be loaded.<br/>
      <span style="font-size:9px;color:#7a92b4;">Check your Google Maps API key billing is enabled for the Static Maps API.</span><br/>
      <a href="${staticMapUrl}" target="_blank" style="color:#f0a500;font-size:10px;margin-top:4px;display:inline-block;">Open image directly ↗</a>
    </div>
    <img
      class="sat-img"
      id="sat-img"
      src="${staticMapUrl}"
      alt="Satellite view of ${currentCode}"
      style="display:none;"
      onload="
        document.getElementById('sat-loading').style.display='none';
        document.getElementById('sat-error').style.display='none';
        this.style.display='block';
      "
      onerror="
        document.getElementById('sat-loading').style.display='none';
        document.getElementById('sat-error').style.display='flex';
        this.style.display='none';
      "
    />
    <div class="sat-label">📡 SATELLITE VIEW · ZOOM ${zoom}</div>
    <div class="sat-coords">${lat}, ${lng}</div>
  </div>

  <!-- Street View Image -->
  ${svStaticUrl ? `
  <div class="sv-wrap" id="sv-wrap">
    <div class="sv-img-loading" id="sv-img-loading">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3abf9e" stroke-width="1.5" style="animation:spin 1.2s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      Loading street view…
    </div>
    <img
      class="sv-img"
      id="sv-img"
      src="${svStaticUrl}"
      alt="Street View of ${currentCode}"
      style="display:none;"
      onload="
        document.getElementById('sv-img-loading').style.display='none';
        this.style.display='block';
        window._svLoaded = true;
      "
      onerror="
        document.getElementById('sv-img-loading').style.display='none';
        document.getElementById('sv-wrap').style.display='none';
      "
    />
    <div class="sv-label-overlay">🚶 STREET VIEW</div>
  </div>` : ''}

  <!-- Info + QR -->
  <div class="info-row">
    <div class="info-fields">
      <div class="field">
        <div class="field-label">DAC Address Code</div>
        <div class="field-value highlight">${currentCode}</div>
      </div>
      <div class="field">
        <div class="field-label">Parish / Region</div>
        <div class="field-value seafoam">${regionName}</div>
      </div>
      <div class="field">
        <div class="field-label">Latitude</div>
        <div class="field-value">${currentLat.toFixed(7)}</div>
      </div>
      <div class="field">
        <div class="field-label">Longitude</div>
        <div class="field-value">${currentLng.toFixed(7)}</div>
      </div>
      <div class="field">
        <div class="field-label">Generated</div>
        <div class="field-value">${dateStr}</div>
      </div>
      <div class="field">
        <div class="field-label">System</div>
        <div class="field-value">DAC Grid v3.0</div>
      </div>
    </div>

    <!-- QR Code -->
    <div class="qr-panel">
      ${qrDataUrl
        ? `<img src="${qrDataUrl}" alt="QR Code"/>`
        : `<div style="width:100px;height:100px;background:#1e2d44;border:3px solid #f0a500;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#7a92b4;text-align:center;padding:8px;">Scan for directions</div>`
      }
      <div class="qr-label">Scan for<br>directions</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="layout-footer">
    <span>DAC – Digital Address Codes</span>
    <span>dac.grenada@gmail.com</span>
    <span>${currentCode} · ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}</span>
  </div>

</div>

${!isPaid ? `
<div id="pay-bar" class="no-print" style="max-width:860px;margin:18px auto 0;display:flex;flex-direction:column;align-items:center;gap:12px;">
  <!-- Pay button -->
  <button id="btn-pay-unlock" onclick="startPayment()" style="
    display:flex;align-items:center;justify-content:center;gap:10px;
    width:100%;padding:14px 24px;
    background:linear-gradient(135deg,#2a1a3a,#1e2d44);
    color:#c09af0;border:2px solid #9b72e8;border-radius:10px;
    font-family:'Syne',sans-serif;font-size:17px;font-weight:700;
    cursor:pointer;letter-spacing:0.03em;
    box-shadow:0 0 24px rgba(155,114,232,0.25);
    transition:all 0.2s;
  ">
    💳 Pay to Unlock — $3
    <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;background:#9b72e8;color:#fff;padding:2px 8px;border-radius:4px;letter-spacing:0.08em;">NO WATERMARK</span>
  </button>

  <!-- Waiting indicator (hidden until pay clicked) -->
  <div id="waiting-bar" style="display:none;width:100%;background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.3);border-radius:8px;padding:12px 18px;display:none;align-items:center;gap:12px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:#f0a500;letter-spacing:0.06em;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f0a500" stroke-width="2" style="animation:spin 1s linear infinite;flex-shrink:0"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
    ⏳ Waiting for payment confirmation… (Stripe opened in new tab)
  </div>

  <!-- Payment confirmed banner (hidden until paid) -->
  <div id="paid-banner" style="display:none;width:100%;background:rgba(58,191,158,0.12);border:2px solid #3abf9e;border-radius:10px;padding:16px 24px;text-align:center;">
    <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:#3abf9e;margin-bottom:6px;">✅ Payment Confirmed — Layout Unlocked!</div>
    <button onclick="window.print()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 28px;background:#3abf9e;color:#0c1220;font-family:'Syne',sans-serif;font-size:15px;font-weight:700;border:none;border-radius:8px;cursor:pointer;margin-top:6px;">
      🖨 Print / Save as PDF
    </button>
  </div>
</div>

<script>
  const DAC_CODE        = '${currentCode}';
  const PAID_KEY        = 'dac_paid_' + DAC_CODE;
  const STRIPE_LINK     = '${STRIPE_PAYMENT_LINK}';
  const SUCCESS_URL_BASE = '${SUCCESS_URL}';
  let pollInterval = null;

  function startPayment() {
    // Save pending code to localStorage so success.html can pick it up
    try { localStorage.setItem('dac_pending_payment_code', DAC_CODE); } catch(e) {}

    const successUrl = SUCCESS_URL_BASE
      + '?code=' + encodeURIComponent(DAC_CODE)
      + '&lat=' + encodeURIComponent('${currentLat.toFixed(7)}')
      + '&lng=' + encodeURIComponent('${currentLng.toFixed(7)}')
      + '&region=' + encodeURIComponent('${currentRegion ? currentRegion.name : ''}')
      + '&rcode=' + encodeURIComponent('${currentRegion ? currentRegion.code : ''}')
      ${ svStaticUrl ? `+ '&sv=' + encodeURIComponent('${svStaticUrl}')` : ''};

    // Open Stripe in a new tab; this preview page stays open
    window.open(STRIPE_LINK, '_blank');

    // Show waiting state
    document.getElementById('btn-pay-unlock').style.display = 'none';
    const wb = document.getElementById('waiting-bar');
    wb.style.display = 'flex';

    // Poll localStorage every 2 seconds
    pollInterval = setInterval(checkPayment, 2000);
  }

  function checkPayment() {
    let paid = false;
    try { paid = localStorage.getItem(PAID_KEY) === '1'; } catch(e) {}
    if (paid) {
      clearInterval(pollInterval);
      unlockLayout();
    }
  }

  function unlockLayout() {
    // Remove watermark overlay
    const wm = document.getElementById('wm-overlay');
    if (wm) wm.remove();

    // Remove the print-blocking <style> tag (injected with id 'print-block-style')
    const blockStyle = document.getElementById('print-block-style');
    if (blockStyle) blockStyle.remove();

    // Also inject a clean print style so the layout prints properly
    const printStyle = document.createElement('style');
    printStyle.textContent = '@media print { html, body { background: #fff !important; padding: 0 !important; margin: 0 !important; } body { display: block !important; color: #000 !important; } .no-print, #pay-bar { display: none !important; } .layout-card { border: 2px solid #c87700 !important; max-width: 100% !important; width: 100% !important; background: #fff !important; } .layout-header { background: #f5f5f5 !important; border-color: #c87700 !important; } .logo { color: #c87700 !important; } .header-right .code { color: #333 !important; } .layout-footer { background: #f5f5f5 !important; } .info-fields { background: #fff !important; } .field-value { color: #222 !important; } .field-value.highlight { color: #c87700 !important; } .field-value.seafoam { color: #2a9d7e !important; } .field-label { color: #666 !important; } .layout-footer span { color: #555 !important; } }';
    document.head.appendChild(printStyle);

    // Hide waiting bar
    document.getElementById('waiting-bar').style.display = 'none';

    // Show paid banner
    document.getElementById('paid-banner').style.display = 'block';
  }
<\/script>` : `
<button class="print-btn no-print" onclick="window.print()">🖨 Print / Save as PDF</button>`}

</body>
</html>`);
  win.document.close();
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'btn-layout' || e.target.closest('#btn-layout')) {
    // Always require payment — never skip to paid layout
    generatePropertyLayout(false);
  }
});
