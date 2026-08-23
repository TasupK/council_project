const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
const ALL_DOMAINS = ['settings', 'main', 'accounting', 'event'];
const DEFAULT_MIGRATED_DOMAINS = ALL_DOMAINS;
const MIGRATED_DOMAINS = process.env.UI_MIGRATED_DOMAINS
  ? process.env.UI_MIGRATED_DOMAINS.split(',').map((value) => value.trim()).filter(Boolean)
  : DEFAULT_MIGRATED_DOMAINS;

const REQUIRED_SHARED_PRIMITIVES = [
  'ui-page-head', 'ui-page-actions', 'ui-card', 'ui-stat-card',
  'ui-btn', 'ui-field', 'ui-toolbar', 'ui-table-wrap', 'ui-table',
  'ui-badge', 'ui-tabs', 'ui-tab', 'ui-modal-overlay', 'ui-modal',
  'ui-loading', 'ui-empty', 'ui-toast'
];

const DOMAIN_SHELLS = {
  settings: [
    'src/300_settings/300_home/Settings_Home.html',
    'src/300_settings/310_users/Settings_Users.html',
    'src/300_settings/320_roles/Settings_Roles.html',
    'src/300_settings/330_permissions/Settings_Permissions.html'
  ],
  main: ['src/250_main/Main.html'],
  accounting: [
    'src/400_accounting/410_ledger/Accounting_Ledger.html',
    'src/400_accounting/420_reconciliation/Accounting_Reconciliation.html',
    'src/400_accounting/430_settlement/Accounting_Settlement.html'
  ],
  event: [
    'src/600_event/610_home/Event_Home.html',
    'src/600_event/620_form/Event_Form.html',
    'src/600_event/630_detail/Event_Detail.html'
  ]
};

const ACCOUNTING_LEDGER_PARTIALS = [
  'src/400_accounting/410_ledger/Accounting_Ledger_View.html',
  'src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html',
  'src/400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal.html'
];

const REQUIRED_IDS = {
  settings: {
    'src/300_settings/310_users/Settings_Users_View.html': [
      'userQ', 'userRole', 'userStatus', 'userReset', 'userCountLabel', 'userTbody', 'userFooterTotal'
    ]
  },
  accounting: {
    'src/400_accounting/410_ledger/Accounting_Ledger_View.html': [
      'ledgerDbLink', 'openRegister', 'sumIncome', 'sumExpense', 'sumPending', 'sumReview',
      'keyword', 'type', 'department', 'event', 'status', 'rows', 'ledgerPagination',
      'prevLedgerPage', 'ledgerPageInfo', 'nextLedgerPage', 'toast'
    ],
    'src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html': [
      'registerModal', 'entryForm', 'expenseBtn', 'incomeBtn', 'formDepartment', 'formEvent', 'eventBalance',
      'entryEvidenceDropzone', 'entryEvidenceFile', 'entryEvidenceFileName', 'draft', 'create'
    ],
    'src/400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal.html': [
      'detailModal', 'detailTitle', 'detailStatus', 'detailAlert', 'detailRows', 'detailEvidenceList',
      'editLedger', 'deleteLedger', 'approve'
    ]
  },
  event: {
    'src/600_event/610_home/Event_Home_View.html': [
      'ew-event-search', 'ew-managerEmail-filter', 'ew-type-filter', 'ew-status-filter',
      'ew-event-summary', 'ew-event-table', 'ew-loading', 'ew-modal-root', 'ew-toast'
    ],
    'src/600_event/620_form/Event_Form_View.html': [
      'ew-app', 'ew-form-breadcrumb', 'ew-form-title', 'ew-event-form', 'ew-member-fee',
      'ew-non-member-fee', 'ew-fee-row', 'ew-event-status-radios', 'ew-related-material-file',
      'ew-related-material-name', 'ew-existing-material', 'ew-manager-display', 'ew-loading', 'ew-modal-root', 'ew-toast'
    ],
    'src/600_event/630_detail/Event_Detail_View.html': [
      'ew-app', 'ew-edit-event', 'ew-detail-name', 'ew-detail-status', 'ew-detail-meta',
      'ew-kpi-total', 'ew-kpi-approved', 'ew-kpi-paid', 'ew-kpi-attended', 'ew-kpi-balance',
      'ew-tab-panel', 'ew-loading', 'ew-modal-root', 'ew-toast'
    ]
  }
};

const REQUIRED_FORM_NAMES = {
  accounting: {
    'src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html': [
      'transaction_date', 'department_name', 'amount', 'counterparty', 'event_name', 'description', 'note'
    ]
  },
  event: {
    'src/600_event/620_form/Event_Form_View.html': [
      'name', 'category', 'description', 'applicationStartAt', 'applicationEndAt', 'eventStartAt',
      'eventEndAt', 'capacity', 'applicationEnabled', 'feeEnabled',
      'attendanceEnabled', 'balanceDistributionEnabled', 'payerFee', 'nonPayerFee', 'status'
    ]
  }
};

const REQUIRED_DATA_ACTIONS = {
  event: {
    'src/600_event/610_home/Event_Home_View.html': ['go-create', 'reset-event-filters'],
    'src/600_event/620_form/Event_Form_View.html': ['go-list'],
    'src/600_event/630_detail/Event_Detail_View.html': ['go-list', 'edit-event', 'detail-tab']
  }
};

const FORBIDDEN_GLOBAL_SELECTORS = [
  '.settings-list', '.settings-row', '.role-panel', '.perm-table', '.perm-group', '.perm-child',
  '.dashboard-section', '.status-grid', '.status-card', '.quick-grid', '.quick-action',
  '.accounting-page', '.accounting-tabs', '.ew-app', '.ew-btn', '.ew-card', '.ew-field',
  '.ew-table', '.ew-toast', '.ew-loading'
];

function read(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    failures.push(`Missing file: ${rel}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function readMany(rels) {
  return rels.map((rel) => read(rel)).join('\n');
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

function requireClassesInSource(label, source, classes) {
  classes.forEach((className) => {
    if (!hasClass(source, className)) failures.push(`${label}: missing class ${className}`);
  });
}

function verifyLiteralMap(map, attribute) {
  Object.entries(map || {}).forEach(([rel, values]) => {
    const source = read(rel);
    values.forEach((value) => {
      if (!new RegExp(`${attribute}=[\"']${value}[\"']`).test(source)) {
        failures.push(`${rel}: missing ${attribute} ${value}`);
      }
    });
  });
}

function verifySharedSystem() {
  const css = read('src/100_common/App_Styles.html');
  REQUIRED_SHARED_PRIMITIVES.forEach((name) => {
    if (!new RegExp(`\\.${name}(?:[\\s:{,.>#\\[])`).test(css)) failures.push(`App_Styles.html missing shared primitive .${name}`);
  });
  FORBIDDEN_GLOBAL_SELECTORS.forEach((selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[},\\n]\\s*)${escaped}(?=[\\s:{,.>#\\[])`, 'm').test(css)) failures.push(`App_Styles.html owns domain selector ${selector}`);
  });
}

function verifyShells(domain) {
  (DOMAIN_SHELLS[domain] || []).forEach((rel) => {
    const source = read(rel);
    if (!source.includes("include('100_common/App_Styles')")) failures.push(`${rel}: missing App_Styles include`);
    if (domain === 'settings' && !source.includes("include('300_settings/common/Settings_Styles')")) failures.push(`${rel}: missing Settings_Styles include`);
  });
}

function verifyHooks(domain) {
  verifyLiteralMap(REQUIRED_IDS[domain], 'id');
  verifyLiteralMap(REQUIRED_FORM_NAMES[domain], 'name');
  verifyLiteralMap(REQUIRED_DATA_ACTIONS[domain], 'data-action');
  if (domain === 'event') {
    const detail = read('src/600_event/630_detail/Event_Detail_View.html');
    ['basic', 'applicants', 'attendance', 'ledger', 'refund'].forEach((tab) => {
      if (!new RegExp(`data-tab=[\"']${tab}[\"']`).test(detail)) failures.push(`Event_Detail_View.html: missing data-tab ${tab}`);
    });
  }
}

function verifySettings() {
  [
    'src/300_settings/300_home/Settings_Home_View.html',
    'src/300_settings/310_users/Settings_Users_View.html',
    'src/300_settings/320_roles/Settings_Roles_View.html',
    'src/300_settings/330_permissions/Settings_Permissions_View.html'
  ].forEach((rel) => requireClasses(rel, ['ui-page-head']));
  requireClasses('src/300_settings/310_users/Settings_Users_View.html', ['ui-btn', 'ui-toolbar', 'ui-field', 'ui-table-wrap', 'ui-table', 'ui-loading']);
  requireClasses('src/300_settings/320_roles/Settings_Roles_View.html', ['ui-btn', 'ui-toolbar', 'ui-field', 'ui-table-wrap', 'ui-table', 'ui-loading']);
  requireClasses('src/300_settings/330_permissions/Settings_Permissions_View.html', ['ui-btn', 'ui-field', 'ui-table-wrap', 'ui-table', 'ui-loading']);
  if (!read('src/300_settings/common/Settings_Styles.html').includes('.perm-table')) failures.push('Settings_Styles.html missing permission-matrix layout ownership');
}

function verifyMain() {
  requireClasses('src/250_main/Main_View.html', ['ui-page-head', 'ui-stat-card', 'ui-card']);
}

function verifyAccounting() {
  const ledgerComposed = readMany(ACCOUNTING_LEDGER_PARTIALS);
  requireClassesInSource('Accounting Ledger composition', ledgerComposed, [
    'ui-page-head', 'ui-page-desc', 'ui-page-actions', 'ui-stat-card', 'ui-toolbar', 'ui-field',
    'ui-table-wrap', 'ui-table', 'ui-pagination', 'ui-modal-overlay', 'ui-modal', 'ui-badge', 'ui-toast'
  ]);
  requireClasses('src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html', [
    'ui-page-head', 'ui-page-desc', 'ui-card', 'ui-toolbar', 'ui-table-wrap', 'ui-table', 'ui-toast'
  ]);
  requireClasses('src/400_accounting/430_settlement/Accounting_Settlement_View.html', [
    'ui-page-head', 'ui-page-desc', 'ui-stat-card', 'ui-card', 'ui-field', 'ui-btn', 'ui-toast'
  ]);
}

function verifyAccountingServerContracts() {
  const client = read('src/400_accounting/common/accounting_client_js.html');
  [
    'api_getLedgerSummary','api_getLedgerEntries','api_createLedgerDraft','api_updateLedgerEntry','api_deleteLedgerEntry',
    'api_processBankTransactionUpload','api_processReconciliation','api_getReconciliations','api_getReconciliation',
    'api_getReconciliationCandidates','api_applyReconciliationLink','api_createLedgerEntryFromReconciliation',
    'api_getSettlementSummary','api_createSettlementReport','api_getSettlementReports','api_getSettlementReport','api_exportSettlementReport'
  ].forEach((name) => {
    if (!client.includes(name)) failures.push(`Accounting semantic client missing ${name}`);
  });
  if (client.includes('apiV1_')) failures.push('Accounting semantic client still references legacy apiV1_ contract');
  const settlement = read('src/400_accounting/430_settlement/accounting_settlement_js.html');
  if (/generateSettlement['"]\)\.disabled\s*=\s*true/.test(settlement)) failures.push('Settlement generation remains forcibly disabled');
}

function verifyEvent() {
  requireClasses('src/600_event/610_home/Event_Home_View.html', ['ui-page-head', 'ui-page-actions', 'ui-card', 'ui-btn', 'ui-field', 'ui-loading', 'ui-toast']);
  requireClasses('src/600_event/620_form/Event_Form_View.html', ['ui-page-head', 'ui-page-actions', 'ui-card', 'ui-btn', 'ui-field', 'ui-loading', 'ui-toast']);
  requireClasses('src/600_event/630_detail/Event_Detail_View.html', ['ui-page-head', 'ui-page-actions', 'ui-card', 'ui-stat-card', 'ui-btn', 'ui-badge', 'ui-tabs', 'ui-tab', 'ui-loading', 'ui-toast']);
  requireClasses('src/600_event/610_home/event_home_js.html', ['ui-table', 'ui-btn', 'ui-empty']);
  requireClasses('src/600_event/600_common/event_common_js.html', ['ui-badge', 'ui-pagination', 'ui-page-btn']);
  requireClasses('src/600_event/630_detail/event_detail_core_js.html', ['ui-card', 'ui-btn', 'ui-badge']);
  requireClasses('src/600_event/630_detail/event_detail_applicants_js.html', ['ui-table', 'ui-modal-overlay', 'ui-modal', 'ui-btn']);
}

verifySharedSystem();
MIGRATED_DOMAINS.forEach((domain) => {
  if (!ALL_DOMAINS.includes(domain)) {
    failures.push(`Unknown migrated domain: ${domain}`);
    return;
  }
  verifyShells(domain);
  verifyHooks(domain);
  if (domain === 'settings') verifySettings();
  if (domain === 'main') verifyMain();
  if (domain === 'accounting') { verifyAccounting(); verifyAccountingServerContracts(); }
  if (domain === 'event') verifyEvent();
});

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  console.error(`Shared UI system migration verification failed (${failures.length}).`);
  process.exitCode = 1;
} else {
  console.log('Shared UI system migration verification passed.');
}
