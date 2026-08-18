/** 거래증빙 metadata service */

function createEvidenceFiles_(transactionId, files, timestamp) {
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

    var evidence = {
      id: generateAccountingId_('EVD'),
      transactionId: transactionId,
      category: file.evidence_category || '추가증빙',
      type: file.evidence_type || '기타',
      evidenceDate: file.evidence_date || '',
      amount: file.evidence_amount || '',
      driveFileId: storedFile ? storedFile.getId() : (file.file_id || ''),
      fileName: fileName,
      managerId: resolveAccountingSessionEmail_(),
      createdAt: timestamp || getCurrentIsoDateTime_(),
      note: file.note || ''
    };

    insertLedgerEvidenceRow_(evidence);
    result.savedCount += 1;
  });
  return result;
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
