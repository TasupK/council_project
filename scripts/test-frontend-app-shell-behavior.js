const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs
  .readFileSync(path.resolve(__dirname, '../src/frontend/app/shell/app_shell_js.html'), 'utf8')
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
  const listeners = {};
  const element = {
    id,
    classList: makeClassList(),
    hidden: false,
    textContent: '',
    href: '',
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return attrs[name] || null; },
    addEventListener(name, handler) { listeners[name] = handler; },
    dispatch(name, event = {}) {
      if (listeners[name]) listeners[name](Object.assign({ target: element, preventDefault() {} }, event));
    },
    contains(target) { return target === element; }
  };
  return element;
}

const ids = [
  'appSidebarToggle', 'appSidebar', 'appUserName', 'appUserTitle', 'appUserCard',
  'appAvatar', 'profilePop', 'popAvatar', 'popName', 'popEmail', 'goMy',
  'appNavMain', 'appNavAccountingGroup', 'appNavAccounting', 'appAccountingSubmenu',
  'appNavAccountingLedger', 'appNavAccountingReconciliation', 'appNavAccountingSettlement',
  'appNavStudentFeeGroup', 'appNavStudentFee', 'appStudentFeeSubmenu',
  'appNavStudentFeeHome', 'appNavStudentFeePayers', 'appNavStudentFeePayments',
  'appNavStudentFeeRefunds', 'appNavEvent', 'appNavSettings'
];
const elements = Object.fromEntries(ids.map(id => [id, makeElement(id)]));
const app = { classList: makeClassList() };
const storageValues = new Map();
const storage = {
  getItem(key) { return storageValues.has(key) ? storageValues.get(key) : null; },
  setItem(key, value) { storageValues.set(key, String(value)); }
};
const documentListeners = {};

const context = {
  console,
  URL,
  Promise,
  APP_USER_NAME: '테스트',
  APP_USER_TITLE: '사용자',
  APP_CURRENT_PAGE: 'main',
  WEB_APP_URL: 'https://example.com/app',
  window: {
    localStorage: storage,
    location: { href: 'https://example.com/app' },
    top: { location: { href: 'https://example.com/app' } }
  },
  document: {
    getElementById(id) { return elements[id] || null; },
    querySelector(selector) { return selector === '.app' ? app : null; },
    addEventListener(name, handler) { documentListeners[name] = handler; }
  },
  appClient: {
    getCurrentUser() {
      return Promise.resolve({
        user: { name: '테스트', email: 'test@example.com', title: '사용자' },
        domainAccess: { main: true, accounting: true, student_fee: true, event: true, settings: true }
      });
    }
  }
};
vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(elements.appNavAccountingLedger.href, 'https://example.com/app?page=accounting_ledger');
assert.strictEqual(elements.appNavAccountingReconciliation.href, 'https://example.com/app?page=accounting_reconciliation');
assert.strictEqual(elements.appNavAccountingSettlement.href, 'https://example.com/app?page=accounting_settlement');
assert.strictEqual(elements.appAccountingSubmenu.hidden, true);
assert.strictEqual(elements.appNavAccounting.getAttribute('aria-expanded'), 'false');

elements.appNavAccounting.dispatch('click');
assert.strictEqual(elements.appAccountingSubmenu.hidden, false);
assert.strictEqual(elements.appNavAccounting.getAttribute('aria-expanded'), 'true');

elements.appNavAccounting.dispatch('click');
assert.strictEqual(elements.appAccountingSubmenu.hidden, true);
assert.strictEqual(elements.appNavAccounting.getAttribute('aria-expanded'), 'false');

context.setAppActiveNavigation('accounting_reconciliation');
assert.strictEqual(elements.appNavAccounting.classList.contains('active'), true);
assert.strictEqual(elements.appNavAccountingLedger.classList.contains('active'), false);
assert.strictEqual(elements.appNavAccountingReconciliation.classList.contains('active'), true);
assert.strictEqual(elements.appNavAccountingSettlement.classList.contains('active'), false);
assert.strictEqual(elements.appAccountingSubmenu.hidden, false);
assert.strictEqual(elements.appNavAccounting.getAttribute('aria-expanded'), 'true');

context.setAppActiveNavigation('main');
assert.strictEqual(elements.appNavAccounting.classList.contains('active'), false);
assert.strictEqual(elements.appAccountingSubmenu.hidden, true);

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

assert.strictEqual(elements.profilePop.classList.contains('open'), false);
elements.appUserCard.dispatch('click');
assert.strictEqual(elements.profilePop.classList.contains('open'), true);
assert.strictEqual(elements.appUserCard.getAttribute('aria-expanded'), 'true');

elements.appUserCard.dispatch('click');
assert.strictEqual(elements.profilePop.classList.contains('open'), false);
assert.strictEqual(elements.appUserCard.getAttribute('aria-expanded'), 'false');

elements.appUserCard.dispatch('click');
documentListeners.click({ target: elements.appNavMain });
assert.strictEqual(elements.profilePop.classList.contains('open'), false);
assert.strictEqual(elements.appUserCard.getAttribute('aria-expanded'), 'false');

elements.goMy.dispatch('click');
assert.strictEqual(context.window.top.location.href, 'https://example.com/app?page=mypage');

console.log('Frontend app shell behavior: PASS');
