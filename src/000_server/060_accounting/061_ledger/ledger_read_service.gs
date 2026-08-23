/** Accounting 내부 ledger read contract */

function normalizeLedgerApprovalStatus_(value) {
  var status = String(value || '').trim();
  return ['승인대기', '승인', '반려'].indexOf(status) > -1 ? status : '승인대기';
}

function buildLedgerAccountingFacts_() {
  return listLedgerRows_().map(function (row) {
    return {
      id: row.id,
      bankTransactionId: row.bankTransactionId || '',
      transactionAt: row.transactionAt || '',
      description: row.description || '',
      transactionType: row.transactionType || '',
      amount: Number(row.amount || 0),
      counterparty: row.counterparty || '',
      source: row.source || 'MANUAL',
      eventId: row.eventId || '',
      businessType: row.businessType || '',
      businessId: row.businessId || '',
      matchStatus: row.matchStatus || '미확인',
      recordStatus: row.recordStatus || '활성',
      managerEmail: row.managerEmail || '',
      createdAt: row.createdAt || '',
      updatedAt: row.updatedAt || '',
      approvalStatus: normalizeLedgerApprovalStatus_(row.approvalStatus),
      approvedByEmail: row.approvedByEmail || '',
      approvedAt: row.approvedAt || '',
      rejectionReason: row.rejectionReason || ''
    };
  });
}

function buildApprovedLedgerAccountingFacts_() {
  return buildLedgerAccountingFacts_().filter(function (row) {
    return String(row.recordStatus || '활성') !== '무효' && row.approvalStatus === '승인';
  });
}

function findLedgerAccountingFactById_(ledgerId) {
  return buildLedgerAccountingFacts_().filter(function (row) {
    return String(row.id || '') === String(ledgerId || '');
  })[0] || null;
}
