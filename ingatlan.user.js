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
// ==/UserScript==

'use strict';

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

collectListings();