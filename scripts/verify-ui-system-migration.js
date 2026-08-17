const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const failures = [];

const REQUIRED_SHARED_PRIMITIVES = [
  'ui-page-head', 'ui-page-actions',
  'ui-card', 'ui-stat-card',
  'ui-btn', 'ui-field', 'ui-toolbar',
  'ui-table-wrap', 'ui-table', 'ui-badge',
  'ui-tabs', 'ui-tab',
  'ui-modal-overlay', 'ui-modal',
  'ui-loading', 'ui-empty', 'ui-toast'
];

const MIGRATED_DOMAINS = [];

const DOMAIN_TARGETS = {
  settings: [
    'src/300_settings/300_home/Settings_Home_View.html',
    'src/300_settings/310_users/Settings_Users_View.html',
    'src/300_settings/320_roles/Settings_Roles_View.html',
    'src/300_settings/330_permissions/Settings_Permissions_View.html'
  ],
  main: ['src/250_main/Main_View.html'],
  accounting: [
    'src/400_accounting/400_home/Accounting_Home_View.html',
    'src/400_accounting/410_ledger/Accounting_Ledger_View.html',
    'src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html',
    'src/400_accounting/430_settlement/Accounting_Settlement_View.html'
  ],
  event: [
    'src/600_event/600_home/Event_Home_View.html',
    'src/600_event/610_form/Event_Form_View.html',
    'src/600_event/620_detail/Event_Detail_View.html'
  ]
};

const REQUIRED_IDS = {
  'src/300_settings/310_users/Settings_Users_View.html': [
    'userQ', 'userRole', 'userStatus', 'userReset', 'userCountLabel',
    'userTbody', 'userFooterTotal'
  ],
  'src/400_accounting/410_ledger/Accounting_Ledger_View.html': [
    'ledgerDbLink', 'openRegister', 'sumIncome', 'sumExpense', 'sumPending', 'sumReview',
    'keyword', 'type', 'department', 'event', 'status', 'rows',
    'ledgerPagination', 'prevLedgerPage', 'ledgerPageInfo', 'nextLedgerPage',
    'registerModal', 'entryForm', 'expenseBtn', 'incomeBtn', 'formDepartment', 'formEvent',
    'eventBalance', 'entryEvidenceDropzone', 'entryEvidenceFile', 'entryEvidenceFileName',
    'draft', 'create', 'detailModal', 'detailTitle', 'detailStatus', 'detailAlert',
    'detailRows', 'detailEvidenceList', 'approve', 'toast'
  ],
  'src/600_event/600_home/Event_Home_View.html': [
    'ew-event-search', 'ew-managerId-filter', 'ew-type-filter', 'ew-status-filter',
    'ew-event-summary', 'ew-event-table', 'ew-loading', 'ew-modal-root', 'ew-toast'
  ],
  'src/600_event/610_form/Event_Form_View.html': [
    'ew-app', 'ew-form-breadcrumb', 'ew-form-title', 'ew-event-form',
    'ew-member-fee', 'ew-non-member-fee', 'ew-event-status-radios',
    'ew-related-material-file', 'ew-related-material-name', 'ew-existing-material',
    'ew-loading', 'ew-modal-root', 'ew-toast'
  ],
  'src/600_event/620_detail/Event_Detail_View.html': [
    'ew-app', 'ew-edit-event', 'ew-detail-name', 'ew-detail-status', 'ew-detail-meta',
    'ew-kpi-total', 'ew-kpi-approved', 'ew-kpi-paid', 'ew-kpi-attended', 'ew-kpi-balance',
    'ew-tab-panel', 'ew-loading', 'ew-modal-root', 'ew-toast'
  ]
};

const REQUIRED_FORM_NAMES = {
  'src/400_accounting/410_ledger/Accounting_Ledger_View.html': [
    'transaction_date', 'department_name', 'amount', 'counterparty', 'event_name', 'description', 'note'
  ],
  'src/600_event/610_form/Event_Form_View.html': [
    'name', 'category', 'description', 'applicationStartAt', 'applicationEndAt',
    'eventStartAt', 'capacity', 'managerId', 'payerFee', 'nonPayerFee', 'status'
  ]
};

const REQUIRED_DATA_ACTIONS = {
  'src/600_event/600_home/Event_Home_View.html': ['go-create', 'reset-event-filters'],
  'src/600_event/610_form/Event_Form_View.html': ['go-list'],
  'src/600_event/620_detail/Event_Detail_View.html': ['go-list', 'edit-event', 'detail-tab']
};

const REQUIRED_DETAIL_TABS = ['basic', 'applicants', 'attendance', 'ledger', 'refund'];

const FORBIDDEN_GLOBAL_SELECTORS = [
  '.settings-list', '.settings-row', '.role-panel', '.perm-table', '.perm-group', '.perm-child',
  '.dashboard-section', '.status-grid', '.status-card', '.quick-grid', '.quick-action',
  '.accounting-page', '.accounting-tabs',
  '.ew-app', '.ew-btn', '.ew-card', '.ew-field', '.ew-table', '.ew-toast', '.ew-loading'
];

function read(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    failures.push(`Missing file: ${rel}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function hasClass(source, className) {
  return new RegExp(`(?:^|[\\s\"'])${className}(?:[\\s\"']|$)`).test(source);
}

function requireClasses(rel, classes) {
  const source = read(rel);
  classes.forEach((className) => {
    if (!hasClass(source, className)) failures.push(`${rel}: missing class ${className}`);
  });
}

function assertLiteralSelectorAbsent(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(^|[},\\n]\\s*)${escaped}(?=[\\s:{,.>#\\[])`, 'm').test(css)) {
    failures.push(`App_Styles.html owns domain selector ${selector}`);
  }
}

function verifySharedPrimitives() {
  const css = read('src/100_common/App_Styles.html');
  REQUIRED_SHARED_PRIMITIVES.forEach((name) => {
    if (!new RegExp(`\\.${name}(?:[\\s:{,.>#\\[])`).test(css)) {
      failures.push(`App_Styles.html missing shared primitive .${name}`);
    }
  });
  FORBIDDEN_GLOBAL_SELECTORS.forEach((selector) => assertLiteralSelectorAbsent(css, selector));
}

function verifyBehaviorHooks() {
  Object.entries(REQUIRED_IDS).forEach(([rel, ids]) => {
    const source = read(rel);
    ids.forEach((id) => {
      if (!new RegExp(`id=[\"']${id}[\"']`).test(source)) failures.push(`${rel}: missing id ${id}`);
    });
  });
  Object.entries(REQUIRED_FORM_NAMES).forEach(([rel, names]) => {
    const source = read(rel);
    names.forEach((name) => {
      if (!new RegExp(`name=[\"']${name}[\"']`).test(source)) failures.push(`${rel}: missing form name ${name}`);
    });
  });
  Object.entries(REQUIRED_DATA_ACTIONS).forEach(([rel, actions]) => {
    const source = read(rel);
    actions.forEach((action) => {
      if (!new RegExp(`data-action=[\"']${action}[\"']`).test(source)) failures.push(`${rel}: missing data-action ${action}`);
    });
  });
  const detail = read('src/600_event/620_detail/Event_Detail_View.html');
  REQUIRED_DETAIL_TABS.forEach((tab) => {
    if (!new RegExp(`data-tab=[\"']${tab}[\"']`).test(detail)) failures.push(`Event_Detail_View.html: missing data-tab ${tab}`);
  });
}

function verifyShellIncludes() {
  const shells = [
    'src/250_main/Main.html',
    'src/300_settings/300_home/Settings_Home.html',
    'src/300_settings/310_users/Settings_Users.html',
    'src/300_settings/320_roles/Settings_Roles.html',
    'src/300_settings/330_permissions/Settings_Permissions.html',
    'src/400_accounting/400_home/Accounting_Home.html',
    'src/400_accounting/410_ledger/Accounting_Ledger.html',
    'src/400_accounting/420_reconciliation/Accounting_Reconciliation.html',
    'src/400_accounting/430_settlement/Accounting_Settlement.html',
    'src/600_event/600_home/Event_Home.html',
    'src/600_event/610_form/Event_Form.html',
    'src/600_event/620_detail/Event_Detail.html'
  ];
  shells.forEach((rel) => {
    const source = read(rel);
    if (!source.includes("include('100_common/App_Styles')")) failures.push(`${rel}: missing App_Styles include`);
  });
  if (MIGRATED_DOMAINS.includes('settings')) {
    shells.filter((rel) => rel.includes('/300_settings/')).forEach((rel) => {
      const source = read(rel);
      if (!source.includes("include('300_settings/common/Settings_Styles')")) {
        failures.push(`${rel}: missing Settings_Styles include`);
      }
    });
  }
}

function verifyDomainAdoption() {
  if (MIGRATED_DOMAINS.includes('settings')) {
    DOMAIN_TARGETS.settings.forEach((rel) => requireClasses(rel, ['ui-page-head']));
    requireClasses('src/300_settings/310_users/Settings_Users_View.html', ['ui-btn', 'ui-toolbar', 'ui-field', 'ui-table-wrap', 'ui-table', 'ui-loading']);
    requireClasses('src/300_settings/320_roles/Settings_Roles_View.html', ['ui-btn', 'ui-toolbar', 'ui-field', 'ui-table-wrap', 'ui-table', 'ui-loading']);
    requireClasses('src/300_settings/330_permissions/Settings_Permissions_View.html', ['ui-btn', 'ui-field', 'ui-table-wrap', 'ui-table', 'ui-loading']);
  }
  if (MIGRATED_DOMAINS.includes('main')) {
    requireClasses('src/250_main/Main_View.html', ['ui-page-head', 'ui-stat-card', 'ui-card']);
  }
  if (MIGRATED_DOMAINS.includes('accounting')) {
    requireClasses('src/400_accounting/400_home/Accounting_Home_View.html', ['ui-page-head', 'ui-tabs', 'ui-tab', 'ui-card']);
    requireClasses('src/400_accounting/410_ledger/Accounting_Ledger_View.html', ['ui-page-head', 'ui-page-actions', 'ui-card', 'ui-toolbar', 'ui-field', 'ui-table-wrap', 'ui-table', 'ui-modal-overlay', 'ui-modal', 'ui-badge', 'ui-toast']);
    requireClasses('src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html', ['ui-page-head', 'ui-tabs', 'ui-tab']);
    requireClasses('src/400_accounting/430_settlement/Accounting_Settlement_View.html', ['ui-page-head', 'ui-tabs', 'ui-tab']);
  }
  if (MIGRATED_DOMAINS.includes('event')) {
    requireClasses('src/600_event/600_home/Event_Home_View.html', ['ui-page-head', 'ui-page-actions', 'ui-card', 'ui-btn', 'ui-field', 'ui-loading', 'ui-toast']);
    requireClasses('src/600_event/610_form/Event_Form_View.html', ['ui-page-head', 'ui-page-actions', 'ui-card', 'ui-btn', 'ui-field', 'ui-loading', 'ui-toast']);
    requireClasses('src/600_event/620_detail/Event_Detail_View.html', ['ui-page-head', 'ui-page-actions', 'ui-card', 'ui-stat-card', 'ui-btn', 'ui-badge', 'ui-tabs', 'ui-tab', 'ui-loading', 'ui-toast']);
  }
}

verifySharedPrimitives();
verifyBehaviorHooks();
verifyShellIncludes();
verifyDomainAdoption();

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  console.error(`Shared UI system migration verification failed (${failures.length}).`);
  process.exitCode = 1;
} else {
  console.log('Shared UI system migration verification passed.');
}
