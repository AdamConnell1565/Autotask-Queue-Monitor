'use strict';
// Loads the userscript into a jsdom page with the test hook set, so tests can call its internals.
// The script stops before its boot section, so no widget, timers or scans start.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'autotaskQueueMonitor.user.js'), 'utf8');
const BLANK = '<!doctype html><html><head><title>Autotask</title></head><body></body></html>';

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

/**
 * @param {object} [o]
 * @param {string} [o.html]      page to load the script into
 * @param {object} [o.settings]  saved settings (atqm:settings)
 * @param {object} [o.storage]   other localStorage entries, stored as JSON unless already a string
 * @param {number} [o.now]       fixed Date.now() for the script
 * @param {string} [o.language]  navigator.language (jsdom says en-US)
 * @param {boolean} [o.boot]     run the whole script (widget, timers, scans) instead of stopping at the test hook
 * @param {string} [o.name]      window.name, e.g. the name Quick start gives a tab it opens
 * @param {object} [o.session]   sessionStorage entries (as strings), e.g. what a page reloaded with the dashboard open has
 */
function load({ html = BLANK, settings, storage = {}, session = {}, now, language, boot = false, name, url = 'https://ww5.autotask.net/Mvc/Framework/Navigation.mvc/Landing' } = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const all = { ...storage };
  if (settings) all['atqm:settings'] = settings;
  for (const [k, v] of Object.entries(all)) window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  for (const [k, v] of Object.entries(session)) window.sessionStorage.setItem(k, v);
  if (now != null) setNow(window, now);
  if (language) Object.defineProperty(window.navigator, 'language', { value: language, configurable: true });
  if (name) window.name = name;
  window.confirm = () => true;
  if (!boot) window.__ATQM_TEST__ = {};
  window.eval(SOURCE);
  return { dom, window, api: window.__ATQM_TEST__, close: () => window.close() };
}

function setNow(window, ts) { window.Date.now = () => ts; }

module.exports = { load, setNow, fixture };
