// ==UserScript==
// @name         Jira Epic Tickets by Issue Type
// @namespace    JIRA
// @version      1.1
// @description  Reorder Jira tickets in an epic based on issue type
// @author       Zsolt Horvath
// @match        https://jira.example.com/browse/*
// @grant        none
// ==/UserScript==

'use strict';

(function () {
    var table_body = document.querySelector('#ghx-issues-in-epic-table tbody');

    // Only epics have this table, so do nothing on other issue pages
    if (!table_body) {
        return;
    }

    var rows = Array.from(table_body.querySelectorAll('tr.issuerow'));
    rows.sort(function (a, b) {
        // The icon can be missing, treat it as an empty issue type
        var a_issuetype = a.querySelector('td.issuetype img')?.getAttribute('title') ?? '';
        var b_issuetype = b.querySelector('td.issuetype img')?.getAttribute('title') ?? '';
        return b_issuetype.localeCompare(a_issuetype, 'en'); // descending alphabetical order, English locale
    });

    rows.forEach(function (row) {
        table_body.appendChild(row);
    });
})();
