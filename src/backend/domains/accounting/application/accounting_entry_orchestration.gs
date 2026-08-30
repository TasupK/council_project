/** Accounting 원장+증빙 생성 orchestration */

function createLedgerEntryWithEvidenceData_(request, context, recordStatus) {
  request = request || {};
  var saved = createLedgerEntryData_(request, context, recordStatus);
  var transactionId = saved && saved.item ? (saved.item.transaction_id || saved.item.id || '') : '';
  var evidence = createEvidenceFilesData_(transactionId, request.evidence_files || request.evidence || [], getCurrentIsoDateTime_());
  return { ok: true, evidence: evidence, item: saved.item };
}

function createLedgerDraftWithEvidenceData_(request, context) {
  return createLedgerEntryWithEvidenceData_(request || {}, context, '활성');
}
