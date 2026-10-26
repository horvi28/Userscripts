// ==UserScript==
// @name         Favorites map
// @namespace    Ingatlan.com
// @version      0.2
// @description  Show saved ingatlan.com listings on a map
// @author       Zsolt Horvath
// @match        https://ingatlan.com/mentett-hirdeteseim
// @require      https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
// @resource     leafletCSS https://unpkg.com/leaflet@1.9.4/dist/leaflet.min.css
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
    const items = document.querySelectorAll('[data-saved-listings-page--item-listing-id-value]');
    return Array.from(items).map(element => {
        const listingId = element.getAttribute('data-saved-listings-page--item-listing-id-value');
        const address = element.querySelector('span.d-block.fs-7.mb-2.text-gray-900'); // For inactive listings, this is "text-gray-200"
        const price = element.querySelector('span.fw-bold.fs-5.text-gray-900');
        const comment = element.querySelector('textarea#listing-comment-input-' + listingId); // e.g. listing-comment-input-35404497
        
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

async function geocodeListings(listings) {
    const features = [];
    for (const listing of listings) {
        try {
            const coords = await geocodeAddress(listing.address);
            if (coords) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [coords.lon, coords.lat], // GeoJSON order: [lon, lat]
                    },
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
                });
            }
        } catch (e) {
            console.warn('ingatlanMap: geocode failed for', listing.address, e);
        }
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

function injectUI() {
    const firstCard = document.querySelector('.saved-listing-item');
    if (!firstCard) return;
    const listContainer = firstCard.parentElement;

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

    const mapContainer = document.createElement('div');
    mapContainer.id = 'fav-map';

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
        }
    });

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
    listContainer.parentElement.insertBefore(toggleButton, listContainer);
    listContainer.parentElement.insertBefore(exportButton, listContainer);
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
