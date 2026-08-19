/** Accounting 내부 ledger read contract */

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
      updatedAt: row.updatedAt || ''
    };
  });
}

function findLedgerAccountingFactById_(ledgerId) {
  return buildLedgerAccountingFacts_().filter(function (row) {
    return String(row.id || '') === String(ledgerId || '');
  })[0] || null;
}
