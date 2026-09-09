const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const fixtures = [
  ['2026-04-18', '이채은', -220000, '승인', true],
  ['2026-04-25', '강하늘', -50000, '승인', true],
  ['2026-02-07', '김수종', -80000, '승인', true],
  ['2026-03-04', '이시은', -20000, '승인대기', false],
  ['2026-02-22', '이은제', 160000, '승인', false],
  ['2026-02-02', '이채은', 80000, '승인', false],
  ['2026-03-26', '장현준', -120000, '승인', false],
  ['2026-04-25', '정성균', -50000, '승인대기', false]
];

function runScenario(dateCells) {
  const dateValue = (day, time) => dateCells ? new Date(day + 'T' + time + '+09:00') : day + ' ' + time;
  const banks = fixtures.map(([day, name, amount], i) => ({
    id: 'B' + i, transactionAt: dateValue(day, '13:12:00'), description: name,
    amount, recordStatus: '정상'
  }));
  const ledgers = fixtures.map(([day, name, amount, approvalStatus, linked], i) => ({
    id: 'L' + i, transactionAt: dateValue(day, '00:00:00'), counterparty: name,
    transactionType: amount < 0 ? '지출' : '수입', amount: Math.abs(amount),
    bankTransactionId: linked ? 'B' + i : '', approvalStatus, recordStatus: '활성'
  }));
  // A deleted copy must not claim the active income's bank transaction.
  ledgers.push({ ...ledgers[5], id: 'VOID', recordStatus: '무효', bankTransactionId: 'B5' });
  const headers = [];
  const items = [];
  const c = vm.createContext({
    console,
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    Utilities: {
      formatDate: (date, zone) => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
          timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date).map(p => [p.type, p.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
      }
    },
    listLedgerRows_: () => ledgers,
    listBankTransactionRows_: () => banks,
    updateLedgerEntryData_: request => {
      ledgers.find(l => l.id === request.transaction_id).bankTransactionId = request.bank_transaction_id;
    },
    createLedgerEntryData_: () => { throw new Error('Unexpected ledger creation'); },
    processLedgerEntryData_: () => { throw new Error('Unexpected approval'); },
    insertReconciliationRow_: row => headers.push(row),
    insertReconciliationItemRow_: row => items.push(row),
    writeAccountingAudit_: () => {}
  });
  for (const file of [
    'core/db/sheets.gs',
    'domains/accounting/application/accounting_common.gs',
    'domains/accounting/application/ledger_query.gs',
    'domains/accounting/application/reconciliation_query.gs',
    'domains/accounting/application/reconciliation_mutation.gs'
  ]) vm.runInContext(fs.readFileSync(path.join(root, 'src/backend', file), 'utf8'), c);
  c.generateAccountingId_ = prefix => prefix + '-' + (headers.length + items.length);
  c.getCurrentIsoDateTime_ = () => '2026-09-09T16:00:00+09:00';
  c.getReconciliationDetailData_ = () => ({ header: headers[headers.length - 1], items });
  const request = { startDate: '2026-02-02', endDate: '2026-04-25', bankTransactionIds: banks.map(b => b.id) };
  const result = c.processReconciliationData_(request, { user: { email: 'test@example.com' } });
  assert.strictEqual(result.header.ledgerTransactionCount, 6);
  assert.strictEqual(result.header.normalCount, 6);
  assert.strictEqual(result.header.missingLedgerCount, 2);
  for (const [i, fixture] of fixtures.entries()) {
    const item = result.items.find(x => x.bankTransactionId === 'B' + i);
    assert.strictEqual(item.result, fixture[3] === '승인' ? '정상' : '원장누락', fixture[1]);
    assert.strictEqual(item.ledgerId, fixture[3] === '승인' ? 'L' + i : '');
  }
  assert.strictEqual(c.reconciliationDateDistanceDays_(banks[5].transactionAt, ledgers[5].transactionAt), 0);
  assert.strictEqual(c.reconciliationDateDistanceDays_('bad-date', ledgers[5].transactionAt), 999999);
  assert.strictEqual(c.reconciliationDateDistanceDays_('2026-02-05', ledgers[5].transactionAt), 3);
  assert.strictEqual(c.reconciliationDateDistanceDays_('2026-02-06', ledgers[5].transactionAt), 4);
  for (const approvalStatus of ['승인대기', '반려', '']) {
    const item = c.buildReconciliationSnapshotItems_([banks[5]], [{ ...ledgers[5], approvalStatus }])[0];
    assert.strictEqual(item.result, '원장누락', 'Even linked ledgers require approval');
  }
  assert.strictEqual(c.buildReconciliationSnapshotItems_([banks[5]], [{ ...ledgers[5], transactionType: '지출' }])[0].result, '원장누락');
  assert.strictEqual(c.buildReconciliationSnapshotItems_([banks[5]], [{ ...ledgers[5], amount: 80001 }])[0].result, '원장누락');
  assert.strictEqual(c.processReconciliationData_(request, { user: { email: 'test@example.com' } }).header.normalCount, 6);
  assert.strictEqual(ledgers.length, 9, 'Repeated reconciliation must not add ledgers');
}

runScenario(false);
runScenario(true);
console.log('Approved ledger reconciliation with Sheet Date cells: PASS (6 normal, 2 missing)');
