// ==UserScript==
// @name         Favorites map
// @namespace    Ingatlan.com
// @version      0.2
// @description  Show saved ingatlan.com listings on a map
// @author       Zsolt Horvath
// @match        https://ingatlan.com/mentett-hirdeteseim
// @require      https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
// @resource     leafletCSS https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @connect      nominatim.openstreetmap.org
// @grant        unsafeWindow
// ==/UserScript==

'use strict';

// Collect listings
// ----------------

function collectListings() {
    const items = document.querySelectorAll('[data-listing-collections-page--item-listing-id-value]');
    return Array.from(items).map(element => {
        const listingId = element.getAttribute('data-listing-collections-page--item-listing-id-value');
        const address = element.querySelector('span.d-block.fs-7.mb-2.text-gray-900'); // For inactive listings, this is "text-gray-200"
        const price = element.querySelector('span.fw-bold.fs-5.text-gray-900');
        const comment = element.querySelector('textarea.comment-textarea');
        
        const details = Array.from(element.querySelectorAll('.d-flex.flex-column.text-left.me-4'));
        let size = '';
        let rooms = '';
        let balcony_size = '';

        details.forEach(detail => {
            const label = detail.querySelector('.fs-7.text-gray-400')?.textContent.trim();
            const value = detail.querySelector('.fs-6.text-gray-900.fw-bold')?.textContent.trim();
            if (label === 'Alapterület') size = value;
            else if (label === 'Szobák') rooms = value;
            else if (label === 'Erkély') balcony_size = value;
        });

        if (address == null) {
            return null;
        }

        return {
            listingId,
            address: address.textContent.trim(),
            price: price ? price.textContent.trim() : '',
            size: size,
            rooms: rooms,
            balcony_size: balcony_size,
            href: 'https://ingatlan.com/' + listingId,
            comment: comment ? comment.value.trim() : '',
        };
    }).filter(item => item !== null);
}

// Geocoding
// ---------

const CACHE_PREFIX = 'geo_cache_';
const GEOCODE_INTERVAL_MS = 1100; // slightly over 1 s to respect Nominatim limit

let geocodeQueue = [];
let geocodeTimer = null;

function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        const cacheKey = CACHE_PREFIX + address;
        const cached = GM_getValue(cacheKey, null);
        if (cached) {
            resolve(JSON.parse(cached));
            return;
        }
        geocodeQueue.push({ address, cacheKey, resolve, reject });
        if (!geocodeTimer) {
            geocodeTimer = setInterval(drainGeocodeQueue, GEOCODE_INTERVAL_MS);
        }
    });
}

function drainGeocodeQueue() {
    if (geocodeQueue.length === 0) {
        clearInterval(geocodeTimer);
        geocodeTimer = null;
        return;
    }
    const { address, cacheKey, resolve, reject } = geocodeQueue.shift();
    const url = 'https://nominatim.openstreetmap.org/search?'
        + 'format=json&limit=1&polygon_geojson=1&countrycodes=hu'
        + '&q=' + encodeURIComponent(address);

    GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'User-Agent': 'IngatlanFavoritesMap/1.0 (userscript)' },
        onload(response) {
            try {
                const results = JSON.parse(response.responseText);
                if (!results.length) {
                    resolve(null);
                    return;
                }
                const r = results[0];
                
                // geojson will be 'LineString' for street-only addresses
                const result = {
                    lat: parseFloat(r.lat),
                    lon: parseFloat(r.lon),
                    geojson: r.geojson || null,
                };
                GM_setValue(cacheKey, JSON.stringify(result));
                resolve(result);
            } catch (e) {
                reject(e);
            }
        },
        onerror(err) {
            reject(err);
        },
    });
}


// Geocode listings into GeoJSON features
// --------------------------------------

const LINE_TYPES = ['LineString', 'MultiLineString'];

// Street-only addresses come back as lines, anything else (including building polygons) is a point
function featureGeometry(coords) {
    if (coords.geojson && LINE_TYPES.includes(coords.geojson.type)) {
        return coords.geojson;
    }
    return {
        type: 'Point',
        coordinates: [coords.lon, coords.lat], // GeoJSON order: [lon, lat]
    };
}

async function geocodeListings(listings, onProgress = null) {
    const features = [];
    for (const [index, listing] of listings.entries()) {
        let feature = null;
        try {
            const coords = await geocodeAddress(listing.address);
            if (coords) {
                feature = {
                    type: 'Feature',
                    geometry: featureGeometry(coords),
                    properties: {
                        listingId:    listing.listingId,
                        address:      listing.address,
                        price:        listing.price,
                        size:         listing.size,
                        rooms:        listing.rooms,
                        balcony_size: listing.balcony_size,
                        comment:      listing.comment,
                        href:         listing.href,
                    },
                };
                features.push(feature);
            }
        } catch (e) {
            console.warn('ingatlanMap: geocode failed for', listing.address, e);
        }
        if (onProgress) onProgress(index + 1, listings.length, feature);
    }
    return features;
}


// Export to GeoJSON
// -----------------

async function exportGeoJSON() {
    const listings = collectListings();
    if (!listings.length) {
        console.warn('ingatlanMap: no listings found to export');
        return;
    }

    console.log(`ingatlanMap: geocoding ${listings.length} listings for export...`);
    const features = await geocodeListings(listings);

    const geojson = JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
    const blob = new Blob([geojson], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ingatlan-favorites.geojson';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`ingatlanMap: exported ${features.length}/${listings.length} listings to GeoJSON`);
}

function createExportButton() {
    const exportButton = document.createElement('button');
    exportButton.id = 'fav-map-export';
    exportButton.textContent = 'Export GeoJSON';
    exportButton.addEventListener('click', () => {
        exportButton.textContent = 'Export...';
        exportButton.disabled = true;
        exportGeoJSON().finally(() => {
            exportButton.textContent = 'Export GeoJSON';
            exportButton.disabled = false;
        });
    });
    return exportButton;
}

// Create a Map
// ------------

const BUDAPEST_CENTER = [47.4979, 19.0402];

let map = null;

function initMap(container) {
    map = L.map(container).setView(BUDAPEST_CENTER, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
}

function createPopup(properties) {
    const popup = document.createElement('div');

    const link = document.createElement('a');
    link.href = properties.href;
    link.target = '_blank';
    link.textContent = properties.address;
    const title = document.createElement('strong');
    title.appendChild(link);
    popup.appendChild(title);

    const addLine = (text, tag = 'span') => {
        const line = document.createElement(tag);
        line.textContent = text;
        popup.append(document.createElement('br'), line);
    };

    const details = [properties.price, properties.size, properties.rooms && properties.rooms + ' room(s)']
        .filter(Boolean).join(' · ');
    if (details) addLine(details);
    if (properties.balcony_size) addLine('Balcony: ' + properties.balcony_size);
    if (properties.comment) addLine(properties.comment, 'em');
    return popup;
}

const MARKER_COLOR = '#e8173c';

function layerStyle(feature) {
    if (LINE_TYPES.includes(feature.geometry.type)) {
        return { color: MARKER_COLOR, weight: 8, opacity: 0.85 };
    }
    return { color: '#fff', weight: 3, fillColor: MARKER_COLOR, fillOpacity: 0.9 };
}

let markersLoaded = false;

// Geocodes the listings once and adds a marker for each as it resolves
async function loadMarkers(onProgress) {
    if (markersLoaded) return;
    markersLoaded = true;

    const listings = collectListings();
    console.log(`ingatlanMap: adding markers for ${listings.length} listings`);

    const bounds = L.latLngBounds([]);
    await geocodeListings(listings, (done, total, feature) => {
        if (feature) {
            const layer = L.geoJSON(feature, {
                pointToLayer: (_, latlng) => L.circleMarker(latlng, { radius: 12 }),
                style: layerStyle,
            });
            layer.bindPopup(createPopup(feature.properties)).addTo(map);
            bounds.extend(layer.getBounds());
        }
        onProgress(done, total);
    });
    console.log(`ingatlanMap: markers done, bounds valid: ${bounds.isValid()}`);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
}

function injectStyles() {
    GM_addStyle(GM_getResourceText('leafletCSS'));
    GM_addStyle(`
        #fav-map {
            display: none;
            height: 500px;
            margin-bottom: 0.75rem;
            border-radius: 6px;
        }
        #fav-map-toggle,
        #fav-map-export {
            display: inline-block;
            margin-bottom: 0.75rem;
            margin-left: 0.5rem;
            padding: 0.5rem 1.25rem;
            background: #fff;
            color: #495057;
            border: 1px solid #adb5bd;
            border-radius: 6px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
        }
        #fav-map-toggle:hover,
        #fav-map-export:hover { background: #f8f9fa; }
    `);
}

function createMapContainer() {
    const mapContainer = document.createElement('div');
    mapContainer.id = 'fav-map';
    return mapContainer;
}

function createToggleButton(mapContainer) {
    const toggleButton = document.createElement('button');
    toggleButton.id = 'fav-map-toggle';
    toggleButton.textContent = 'Show map';
    toggleButton.addEventListener('click', () => {
        const show = mapContainer.style.display !== 'block';
        mapContainer.style.display = show ? 'block' : 'none';
        toggleButton.textContent = show ? 'Hide map' : 'Show map';
        if (show) {
            if (!map) initMap(mapContainer);
            map.invalidateSize(); // the container was hidden when the map was created
            loadMarkers((done, total) => {
                toggleButton.textContent = done < total ? `Geocoding ${done}/${total}...` : 'Hide map';
            }).catch(e => console.error('ingatlanMap: loading markers failed', e));
        }
    });
    return toggleButton;
}

function injectUI() {
    const firstCard = document.querySelector('.saved-listing-item');
    if (!firstCard) return;
    const listContainer = firstCard.parentElement;

    injectStyles();

    const mapContainer = createMapContainer();
    listContainer.parentElement.insertBefore(createToggleButton(mapContainer), listContainer);
    listContainer.parentElement.insertBefore(createExportButton(), listContainer);
    listContainer.parentElement.insertBefore(mapContainer, listContainer);
}

// Wait for the Next.js SPA to render listing cards before injecting UI
function waitForListings(callback, maxWaitMs = 8000) {
    const start = Date.now();
    const interval = setInterval(() => {
        if (document.querySelector('.saved-listing-item')) {
            clearInterval(interval);
            callback();
        } else if (Date.now() - start > maxWaitMs) {
            clearInterval(interval);
            console.warn('ingatlanMap: timed out waiting for listing cards');
        }
    }, 300);
}

waitForListings(injectUI);
