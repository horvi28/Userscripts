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
        const size = element.querySelector('span.fw-bold.fs-6.text-gray-900');

        if (address == null) {
            return null;
        }

        return {
            listingId,
            address: address.textContent.trim(),
            price: price ? price.textContent.trim() : '',
            size: size ? size.textContent.trim() : '',
            href: 'https://ingatlan.com/' + listingId,
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

console.log(collectListings());
console.log(geocodeAddress("Budapest I. kerület, Logodi utca"))
console.log(geocodeAddress("Budapest IX. kerület, Viola utca 42."))