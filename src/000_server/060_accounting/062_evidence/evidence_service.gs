/** 거래증빙 metadata service */

function createEvidenceFilesData_(transactionId, files, timestamp) {
  files = files || [];
  if (!files.length) return { savedCount: 0, errors: [] };

  var result = { savedCount: 0, errors: [] };
  files.forEach(function (file, index) {
    file = file || {};
    var fileName = file.file_name || file.name || ('evidence_' + (index + 1));
    var storedFile = null;

    if (file.content_base64) {
      try {
        storedFile = createEvidenceDriveFile_(transactionId, fileName, file.file_type || file.mime_type, file.content_base64);
      } catch (error) {
        result.errors.push({ file_name: fileName, message: error.message || String(error) });
      }
    }

    var driveFileId = storedFile ? storedFile.getId() : (file.file_id || '');
    if (!driveFileId) {
      result.errors.push({ file_name: fileName, message: '증빙 원본 파일이 저장되지 않았습니다.' });
      return;
    }

    var evidence = {
      id: generateAccountingId_('EVD'),
      transactionId: transactionId,
      category: file.evidence_category || '추가증빙',
      type: file.evidence_type || '기타',
      evidenceDate: file.evidence_date || '',
      amount: file.evidence_amount || '',
      driveFileId: driveFileId,
      fileName: fileName,
      ocrStatus: file.ocr_status || '',
      ocrValidationResult: file.ocr_validation_result || '',
      managerEmail: resolveAccountingSessionEmail_(),
      createdAt: timestamp || getCurrentIsoDateTime_(),
      note: file.note || ''
    };

    insertLedgerEvidenceRow_(evidence);
    result.savedCount += 1;
  });
  return result;
}

function validateEvidenceOcrData_(request, context) {
  request = request || {};
  if (!request.evidence_id) throw new Error('evidence_id가 필요합니다.');
  var evidence = findLedgerEvidenceRowById_(request.evidence_id);
  if (!evidence) throw new Error('거래증빙을 찾을 수 없습니다.');
  if (!evidence.driveFileId) throw new Error('거래증빙 원본 파일이 없습니다.');
  var ledger = findLedgerRowById_(evidence.transactionId);
  if (!ledger || String(ledger.recordStatus || '활성') === '무효') throw new Error('증빙이 속한 원장을 찾을 수 없습니다.');

  var ocrStatus = '완료';
  var validationResult = '확인필요';
  try {
    var ocrText = extractEvidenceOcrText_(evidence);
    var candidate = parseEvidenceOcrCandidate_(ocrText);
    validationResult = evaluateEvidenceOcrCandidate_(candidate, ledger);
  } catch (error) {
    ocrStatus = '실패';
    validationResult = '추출실패';
  }

  var changes = { ocrStatus: ocrStatus, ocrValidationResult: validationResult, managerEmail: resolveAccountingActorEmail_(context) };
  updateLedgerEvidenceRowById_(evidence.id, changes);
  writeAccountingAudit_(
    resolveAccountingActorEmail_(context),
    'VALIDATE',
    'EVIDENCE',
    evidence.id,
    JSON.stringify({ ocrStatus: evidence.ocrStatus || '', ocrValidationResult: evidence.ocrValidationResult || '' }),
    JSON.stringify(changes),
    '거래증빙 OCR 검증'
  );
  return {
    evidence_id: evidence.id,
    transaction_id: evidence.transactionId,
    ocr_status: ocrStatus,
    ocr_validation_result: validationResult
  };
}

function getEvidenceAuditListData_(filter) {
  filter = filter || {};
  var ledgerById = getLedgerEntriesData_().reduce(function (index, item) {
    index[item.transaction_id] = item;
    return index;
  }, {});
  var keyword = String(filter.keyword || '').trim().toLowerCase();
  var items = listLedgerEvidenceRows_().map(function (evidence) {
    var ledger = ledgerById[evidence.transactionId];
    if (!ledger) return null;
    return {
      evidence_id: evidence.id,
      transaction_id: evidence.transactionId,
      transaction_date: String(ledger.transaction_date || '').slice(0, 10),
      transaction_type: ledger.transaction_type,
      amount: Number(ledger.amount || 0),
      file_name: evidence.fileName || '',
      file_id: evidence.driveFileId || '',
      category: evidence.category || '',
      type: evidence.type || '',
      ocr_status: evidence.ocrStatus || '',
      ocr_validation_result: evidence.ocrValidationResult || '',
      created_at: formatDateTimeValue_(evidence.createdAt)
    };
  }).filter(Boolean).filter(function (item) {
    if (filter.startDate && item.transaction_date < filter.startDate) return false;
    if (filter.endDate && item.transaction_date > filter.endDate) return false;
    if (filter.transaction_type && filter.transaction_type !== '전체' && item.transaction_type !== filter.transaction_type) return false;
    if (keyword && [item.file_name, item.transaction_id, item.category, item.type].join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    return true;
  });
  return { items: items, totalCount: items.length };
}
