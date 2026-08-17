/** 거래증빙 metadata service */

function saveEvidenceFiles_(transactionId, files, timestamp) {
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
      id: makeId_('EVD'),
      transactionId: transactionId,
      category: file.evidence_category || '추가증빙',
      type: file.evidence_type || '기타',
      evidenceDate: file.evidence_date || '',
      amount: file.evidence_amount || '',
      driveFileId: storedFile ? storedFile.getId() : (file.file_id || ''),
      fileName: fileName,
      managerId: getCurrentUserName_(),
      createdAt: timestamp || getCurrentIsoDateTime_(),
      note: file.note || ''
    };

    insertLedgerEvidenceRow_(evidence);
    result.savedCount += 1;
  });
  return result;
}
