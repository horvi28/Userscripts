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