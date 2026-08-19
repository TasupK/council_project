const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs
  .readFileSync(path.resolve(__dirname, '../src/100_common/app_shell_js.html'), 'utf8')
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    contains: value => values.has(value),
    toggle(value, force) {
      if (force === undefined) {
        if (values.has(value)) values.delete(value);
        else values.add(value);
        return values.has(value);
      }
      if (force) values.add(value);
      else values.delete(value);
      return !!force;
    }
  };
}

function makeElement(id) {
  const attrs = {};
  return {
    id,
    classList: makeClassList(),
    hidden: false,
    textContent: '',
    href: '',
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return attrs[name] || null; },
    addEventListener() {}
  };
}

const ids = [
  'appSidebarToggle', 'appSidebar', 'appUserName', 'appUserTitle', 'appUserCard',
  'appNavMain', 'appNavAccounting', 'appNavStudentFeeGroup', 'appNavStudentFee',
  'appStudentFeeSubmenu', 'appNavStudentFeeHome', 'appNavStudentFeePayers',
  'appNavStudentFeePayments', 'appNavStudentFeeRefunds', 'appNavEvent', 'appNavSettings'
];
const elements = Object.fromEntries(ids.map(id => [id, makeElement(id)]));
const app = { classList: makeClassList() };
const storageValues = new Map();
const storage = {
  getItem(key) { return storageValues.has(key) ? storageValues.get(key) : null; },
  setItem(key, value) { storageValues.set(key, String(value)); }
};

const runChain = {
  withSuccessHandler() { return this; },
  withFailureHandler() { return this; },
  api_getCurrentUser() { return this; }
};

const context = {
  console,
  URL,
  APP_USER_NAME: '테스트',
  APP_USER_TITLE: '사용자',
  APP_CURRENT_PAGE: 'main',
  WEB_APP_URL: 'https://example.com/app',
  window: { localStorage: storage, location: { href: 'https://example.com/app' } },
  document: {
    getElementById(id) { return elements[id] || null; },
    querySelector(selector) { return selector === '.app' ? app : null; }
  },
  google: { script: { run: runChain } }
};
vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(app.classList.contains('sidebar-hidden'), false);
assert.strictEqual(elements.appSidebarToggle.getAttribute('aria-expanded'), 'true');
assert.strictEqual(elements.appSidebar.getAttribute('aria-hidden'), 'false');

storage.setItem('council.appShell.sidebarHidden', 'true');
context.applyInitialAppSidebarState_();
assert.strictEqual(app.classList.contains('sidebar-hidden'), true);
assert.strictEqual(elements.appSidebarToggle.getAttribute('aria-expanded'), 'false');
assert.strictEqual(elements.appSidebar.getAttribute('aria-hidden'), 'true');

context.toggleAppSidebar_();
assert.strictEqual(app.classList.contains('sidebar-hidden'), false);
assert.strictEqual(storage.getItem('council.appShell.sidebarHidden'), 'false');
assert.strictEqual(elements.appSidebarToggle.getAttribute('aria-expanded'), 'true');

storage.setItem = () => { throw new Error('blocked'); };
assert.doesNotThrow(() => context.toggleAppSidebar_());
assert.strictEqual(app.classList.contains('sidebar-hidden'), true);

storage.getItem = () => { throw new Error('blocked'); };
assert.doesNotThrow(() => context.applyInitialAppSidebarState_());
assert.strictEqual(app.classList.contains('sidebar-hidden'), false);

console.log('Frontend app shell behavior: PASS');
