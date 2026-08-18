/** 계좌 거래 OCR 수집 orchestration */

function buildBankTransactionDuplicateKey_(item) {
  return [
    String(item.sourceFileName || '').trim().toLowerCase(),
    String(item.transactionAt || '').slice(0, 10),
    isTruthyValue_(item.expense) ? 'E' : 'I',
    Number(item.amount || 0),
    normalizeReconciliationText_([item.counterparty, item.description].join(' '))
  ].join('|');
}

function applyParsedBankTransactions_(items) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existing = listBankTransactionRows_();
    var keys = existing.reduce(function (index, row) { index[buildBankTransactionDuplicateKey_(row)] = true; return index; }, {});
    var saved = [], duplicates = [];
    (items || []).forEach(function (item) {
      var key = buildBankTransactionDuplicateKey_(item);
      if (keys[key]) { duplicates.push(item); return; }
      var row = {
        id: generateAccountingId_('BNK'), transactionAt: item.transactionAt, expense: Boolean(item.expense),
        counterparty: item.counterparty || '', description: item.description || '', amount: Math.abs(Number(item.amount || 0)),
        sourceFileName: item.sourceFileName || '', createdAt: getCurrentIsoDateTime_()
      };
      insertBankTransactionRow_(row); keys[key] = true; saved.push(row);
    });
    return { savedItems: saved, duplicateItems: duplicates };
  } finally { lock.releaseLock(); }
}

function processBankTransactionUploadData_(request, context) {
  request = request || {};
  var files = request.files || (request.file ? [request.file] : []);
  if (!files.length) throw new Error('업로드할 계좌 파일이 없습니다.');
  var parsedItems = [], reviewRequired = [], failures = [], processed = 0, extracted = 0;
  files.forEach(function (rawFile) {
    var file = normalizeBankUploadFile_(rawFile);
    var status = '실패', errorMessage = '', parsed = { items: [], reviewRequiredItems: [], extractedCount: 0 };
    try {
      validateBankOcrFile_(file);
      var text = extractBankOcrText_(file);
      if (!String(text || '').trim()) throw new Error('OCR 텍스트를 추출할 수 없습니다.');
      parsed = parseBankOcrTransactions_(text, file.file_name, request.baseYear || request.base_year);
      parsedItems = parsedItems.concat(parsed.items);
      reviewRequired = reviewRequired.concat(parsed.reviewRequiredItems);
      extracted += parsed.extractedCount;
      processed += 1;
      status = parsed.reviewRequiredItems.length ? '확인필요' : '성공';
    } catch (error) {
      errorMessage = error && error.message ? error.message : String(error);
      failures.push({ file_name: file.file_name, reason: errorMessage });
    }
    insertBankOcrLogRow_({ id: generateAccountingId_('OCR'), fileName: file.file_name, status: status, extractedCount: parsed.extractedCount || 0, errorMessage: errorMessage, createdAt: getCurrentIsoDateTime_() });
  });
  var saveResult = applyParsedBankTransactions_(parsedItems);
  var previewItems = typeof buildReconciliationResults_ === 'function'
    ? buildReconciliationResults_(saveResult.savedItems, getReconciliationLedgerCandidates_({}))
    : [];
  writeAccountingAudit_(resolveAccountingActorEmail_(context), 'OCR_UPLOAD', 'BANK_TRANSACTION', 'BATCH', '', JSON.stringify({ savedCount: saveResult.savedItems.length, duplicateCount: saveResult.duplicateItems.length }), '계좌 거래 OCR 업로드');
  return {
    uploadedFileCount: files.length, processedFileCount: processed, failedFileCount: failures.length,
    extractedCount: extracted, savedCount: saveResult.savedItems.length, duplicateCount: saveResult.duplicateItems.length,
    reviewRequiredItems: reviewRequired, failedFiles: failures, previewItems: previewItems
  };
}

function getBankOcrLogsData_(request) {
  var limit = Math.min(50, Math.max(1, Number((request || {}).limit || 10)));
  var rows = listBankOcrLogRows_().slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  return { items: rows.slice(0, limit).map(function (row) { return { id: row.id, fileName: row.fileName, status: row.status, extractedCount: Number(row.extractedCount || 0), errorMessage: row.errorMessage || '', createdAt: formatDateTimeValue_(row.createdAt) }; }) };
}
