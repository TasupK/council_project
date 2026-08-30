/** Accounting 내부 evidence read contract */

function buildEvidenceAccountingFacts_() {
  return listLedgerEvidenceRows_().map(function (row) {
    return {
      id: row.id,
      transactionId: row.transactionId || '',
      category: row.category || '',
      type: row.type || '',
      evidenceDate: row.evidenceDate || '',
      amount: row.amount || '',
      driveFileId: row.driveFileId || '',
      fileName: row.fileName || '',
      ocrStatus: row.ocrStatus || '',
      ocrValidationResult: row.ocrValidationResult || '',
      managerEmail: row.managerEmail || '',
      createdAt: row.createdAt || '',
      note: row.note || ''
    };
  });
}

function findEvidenceAccountingFactById_(evidenceId) {
  return buildEvidenceAccountingFacts_().filter(function (row) {
    return String(row.id || '') === String(evidenceId || '');
  })[0] || null;
}
