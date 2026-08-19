/** Toss Bank Excel 계좌거래 수집 orchestration */

function applyBankTransactions_(items, context) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existing = listBankTransactionRows_();
    var sourceHashes = existing.reduce(function (index, row) {
      if (row.sourceHash) index[String(row.sourceHash)] = true;
      return index;
    }, {});
    var saved = [];
    var duplicateCount = 0;

    (items || []).forEach(function (item) {
      var sourceHash = buildBankTransactionSourceHash_(item);
      if (sourceHashes[sourceHash]) {
        duplicateCount += 1;
        return;
      }
      var row = {
        id: generateAccountingId_('BNK'),
        transactionAt: item.transactionAt,
        description: item.description,
        bankType: item.bankType,
        institution: item.institution || '',
        counterpartyAccountNumber: item.counterpartyAccountNumber || '',
        amount: Number(item.amount),
        balanceAfter: item.balanceAfter === '' ? '' : Number(item.balanceAfter),
        memo: item.memo || '',
        sourceHash: sourceHash,
        recordStatus: '정상',
        createdAt: getCurrentIsoDateTime_()
      };
      insertBankTransactionRow_(row);
      sourceHashes[sourceHash] = true;
      saved.push(row);
    });

    return { savedCount: saved.length, duplicateCount: duplicateCount, items: saved };
  } finally {
    lock.releaseLock();
  }
}

function processBankTransactionUploadData_(request, context) {
  request = request || {};
  var normalizedRows = [];
  var failedFiles = [];
  var uploadedFileCount = 0;

  if (Array.isArray(request.rows)) {
    normalizedRows = parseTossBankTransactionRows_(request.rows);
  } else {
    var files = request.files || (request.file ? [request.file] : []);
    if (!files.length) throw new Error('업로드할 토스뱅크 거래내역 파일이 없습니다.');
    uploadedFileCount = files.length;
    files.forEach(function (rawFile) {
      var file = normalizeBankTransactionUploadFile_(rawFile);
      try {
        var sourceRows = readTossBankTransactionRowsFromFile_(file);
        normalizedRows = normalizedRows.concat(parseTossBankTransactionRows_(sourceRows));
      } catch (error) {
        failedFiles.push({
          file_name: file.fileName,
          reason: error && error.message ? error.message : String(error)
        });
      }
    });
  }

  var result = applyBankTransactions_(normalizedRows, context);
  var actor = resolveAccountingActorEmail_(context);
  writeAccountingAudit_(
    actor,
    'IMPORT',
    'bankTransactions',
    'BATCH',
    null,
    { savedCount: result.savedCount, duplicateCount: result.duplicateCount },
    '토스뱅크 거래내역 가져오기'
  );

  return {
    uploadedFileCount: uploadedFileCount,
    failedFileCount: failedFiles.length,
    extractedCount: normalizedRows.length,
    savedCount: result.savedCount,
    duplicateCount: result.duplicateCount,
    failedFiles: failedFiles,
    items: result.items
  };
}
