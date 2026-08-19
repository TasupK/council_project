const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/060_accounting/063_reconciliation/bank_transaction_parser.gs'), 'utf8'), context);

assert.strictEqual(typeof context.parseTossBankTransactionRows_, 'function');
assert.strictEqual(typeof context.buildBankTransactionSourceString_, 'function');

const sourceRow = {
  '거래 일시': '2026-05-16 14:31:42',
  '적요': '노브랜드스타필드고양점',
  '거래 유형': '체크카드결제',
  '거래 기관': '',
  '계좌번호': '',
  '거래 금액': -8800,
  '거래 후 잔액': 4108043,
  '메모': ''
};

const parsed = context.parseTossBankTransactionRows_([sourceRow]);
assert.strictEqual(parsed.length, 1);
assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed[0])), {
  transactionAt: '2026-05-16 14:31:42',
  description: '노브랜드스타필드고양점',
  bankType: '체크카드결제',
  institution: '',
  counterpartyAccountNumber: '',
  amount: -8800,
  balanceAfter: 4108043,
  memo: ''
});

const blankBalance = context.parseTossBankTransactionRows_([{
  '거래 일시': '2026-02-01 18:21:08',
  '적요': '학생회비 이월',
  '거래 유형': '입금',
  '거래 기관': '',
  '계좌번호': '',
  '거래 금액': 1151683,
  '거래 후 잔액': '',
  '메모': ''
}])[0];
assert.strictEqual(blankBalance.balanceAfter, '');
assert.strictEqual(blankBalance.amount, 1151683);

const baseString = context.buildBankTransactionSourceString_(parsed[0]);
const sameString = context.buildBankTransactionSourceString_({ ...parsed[0] });
assert.strictEqual(baseString, sameString);

['transactionAt', 'description', 'bankType', 'institution', 'counterpartyAccountNumber', 'amount', 'balanceAfter', 'memo'].forEach(key => {
  const changed = { ...parsed[0] };
  changed[key] = key === 'amount' ? -8801 : String(changed[key] || '') + 'x';
  assert.notStrictEqual(context.buildBankTransactionSourceString_(changed), baseString, key + ' must affect source hash input');
});

assert.throws(() => context.parseTossBankTransactionRows_([{
  ...sourceRow,
  '거래 금액': 'not-a-number'
}]), /거래 금액/);

console.log('Toss bank transaction parser contract: PASS');
