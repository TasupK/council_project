const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let evidenceUpdate = null;
const context = {
  console,
  findLedgerEvidenceRowById_: id => id === 'EVD-1' ? { id, transactionId: 'TRX-1', driveFileId: 'FILE-1' } : null,
  findLedgerAccountingFactById_: id => id === 'TRX-1' ? { id, transactionAt: '2026-02-01 18:21:00', transactionType: '수입', amount: 1151683 } : null,
  updateLedgerEvidenceRowById_: (id, changes) => { evidenceUpdate = { id, ...changes }; },
  resolveAccountingActorEmail_: () => 'tester@mju.ac.kr',
  writeAccountingAudit_: () => {}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/060_accounting/062_evidence/evidence_ocr_service.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/060_accounting/062_evidence/evidence_service.gs'), 'utf8'), context);
context.extractEvidenceOcrText_ = () => '+1,151,683원\n2026-02-01 18:21\n학생회비 이월\n입금';

assert.strictEqual(typeof context.validateEvidenceOcrData_, 'function');
assert.strictEqual(typeof context.parseEvidenceOcrCandidate_, 'function');
assert.strictEqual(typeof context.evaluateEvidenceOcrCandidate_, 'function');

const candidate = context.parseEvidenceOcrCandidate_('+1,151,683원\n2026-02-01 18:21\n학생회비 이월\n입금');
assert.strictEqual(candidate.amount, 1151683);
assert.strictEqual(candidate.transactionType, '수입');
assert.strictEqual(candidate.transactionDate, '2026-02-01');

assert.strictEqual(context.evaluateEvidenceOcrCandidate_(candidate, { transactionAt: '2026-02-01 18:21:00', transactionType: '수입', amount: 1151683 }), '정상');
assert.strictEqual(context.evaluateEvidenceOcrCandidate_({ ...candidate, amount: 1000 }, { transactionAt: '2026-02-01', transactionType: '수입', amount: 1151683 }), '금액불일치');
assert.strictEqual(context.evaluateEvidenceOcrCandidate_({ ...candidate, transactionDate: '2026-02-02' }, { transactionAt: '2026-02-01', transactionType: '수입', amount: 1151683 }), '일자불일치');
assert.strictEqual(context.evaluateEvidenceOcrCandidate_({ ...candidate, transactionType: '지출' }, { transactionAt: '2026-02-01', transactionType: '수입', amount: 1151683 }), '확인필요');

const result = context.validateEvidenceOcrData_({ evidence_id: 'EVD-1' }, {});
assert.strictEqual(result.ocr_status, '완료');
assert.strictEqual(result.ocr_validation_result, '정상');
assert.deepStrictEqual(evidenceUpdate, { id: 'EVD-1', ocrStatus: '완료', ocrValidationResult: '정상', managerEmail: 'tester@mju.ac.kr' });
assert.strictEqual('ocrText' in evidenceUpdate, false);
assert.strictEqual('amount' in evidenceUpdate, false);
assert.strictEqual('transactionAt' in evidenceUpdate, false);

assert.throws(() => context.validateEvidenceOcrData_({ evidence_id: 'NOPE' }, {}), /증빙/);
console.log('Evidence OCR v2 contract: PASS');
