// ==UserScript==
// @name         JIRA filter SP sum
// @namespace    JIRA
// @version      1.1
// @description  In the filter view, it sums up the SP in the table. It is useful when you want to sum up the SPs for an epic for example.
// @author       Horvath Zsolt
// @match        *://*/issues/?filter*
// @match        *://*/issues/?jql*
// @grant        none
// ==/UserScript==

'use strict';

(function () {
    // The custom field ID of the story points differs between JIRA instances, so find the column by its header text instead
    // Set the field ID here (e.g. 'customfield_10016') if your column has a different name
    const storyPointFieldId = '';
    const storyPointHeaderPattern = /^story points?( estimate)?$/i;

    // Make sure to only run on JIRA pages with the issue table
    const headers = Array.from(document.querySelectorAll("[data-id^='customfield_'] > button"));
    var targetElement = headers.find(function (button) {
        const fieldId = button.parentElement.getAttribute('data-id');
        return storyPointFieldId ? fieldId === storyPointFieldId : storyPointHeaderPattern.test(button.textContent.trim());
    });
    if (!targetElement) {
        return;
    }
    const fieldId = targetElement.parentElement.getAttribute('data-id');

    const storyPointArray = Array.from(document.querySelectorAll("td." + fieldId)).map(function (td) {
        return td.textContent.trim();
    });

    // Clean the array: trim, change the decimal delimiter, parse to float
    var storyPointArrayFloat = storyPointArray.map(function (num) { return parseFloat(num.replace(",", ".")); });

    // Get rid of the NaN values
    storyPointArrayFloat = storyPointArrayFloat.filter(function (num) { return !isNaN(num); });

    // Sum up the values
    var storyPointSum = storyPointArrayFloat.reduce(function (total, num) { return total + num; }, 0);
    storyPointSum = Math.round(storyPointSum * 100) / 100; // Rounding to two decimal

    targetElement.textContent += ": " + storyPointSum;
})();
