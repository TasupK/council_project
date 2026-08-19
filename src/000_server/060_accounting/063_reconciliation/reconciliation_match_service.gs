/** 계좌거래-원장 연결 검증 정책 */

function resolveReconciliationLedgerBankMatchStatus_(bankTransactionId, transactionType, amount, currentLedgerId) {
  if (!bankTransactionId) return '미확인';
  var bank = findBankTransactionRowById_(bankTransactionId);
  if (!bank) throw new Error('연결할 계좌거래를 찾을 수 없습니다.');
  if (String(bank.recordStatus || '정상') === '무효') throw new Error('무효 처리된 계좌거래는 원장에 연결할 수 없습니다.');

  var claimed = buildLedgerAccountingFacts_().some(function (row) {
    if (currentLedgerId && String(row.id) === String(currentLedgerId)) return false;
    return String(row.recordStatus || '활성') !== '무효' &&
      String(row.bankTransactionId || '') === String(bankTransactionId);
  });
  if (claimed) throw new Error('해당 계좌거래는 이미 다른 원장에 연결되어 있습니다.');

  var expectedType = Number(bank.amount) < 0 ? '지출' : '수입';
  var amountMatches = Math.abs(Number(bank.amount || 0)) === Number(amount || 0);
  return expectedType === transactionType && amountMatches ? '정상' : '확인필요';
}
