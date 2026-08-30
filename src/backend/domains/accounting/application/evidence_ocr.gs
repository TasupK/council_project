/** 거래증빙 OCR 추출/비교 capability */

function extractEvidenceOcrText_(evidence) {
  if (!evidence || !evidence.driveFileId) throw new Error('OCR할 증빙 파일이 없습니다.');
  var file = DriveApp.getFileById(evidence.driveFileId);
  return extractEvidenceOcrTextFromBlob_(file.getBlob(), file.getName());
}

function extractEvidenceOcrTextFromBlob_(blob, fileName) {
  var documentId = '';
  try {
    var created = Drive.Files.create({
      name: 'OCR_' + String(fileName || 'evidence'),
      mimeType: 'application/vnd.google-apps.document'
    }, blob, { ocrLanguage: 'ko', fields: 'id' });
    documentId = created.id;
    return DocumentApp.openById(documentId).getBody().getText() || '';
  } finally {
    if (documentId) {
      try { Drive.Files.remove(documentId); }
      catch (removeError) {
        try { DriveApp.getFileById(documentId).setTrashed(true); } catch (trashError) {}
      }
    }
  }
}

function parseEvidenceOcrCandidate_(ocrText) {
  var text = String(ocrText || '').replace(/\r/g, '\n');
  var amountMatch = text.match(/([+-]?)\s*(?:₩|￦)?\s*([\d,]+)\s*원/);
  var dateMatch = text.match(/(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);
  var transactionType = /(?:출금|체크카드결제|카드\s*결제|송금)/.test(text)
    ? '지출'
    : /(?:입금|이자입금|캐시백|프로모션입금)/.test(text) ? '수입' : '';
  var amount = amountMatch ? Number(String(amountMatch[2]).replace(/,/g, '')) : null;
  var transactionDate = '';
  if (dateMatch) {
    transactionDate = [
      dateMatch[1],
      String(Number(dateMatch[2])).padStart(2, '0'),
      String(Number(dateMatch[3])).padStart(2, '0')
    ].join('-');
  }
  return {
    amount: amount,
    transactionDate: transactionDate,
    transactionType: transactionType,
    description: extractEvidenceOcrDescription_(text)
  };
}

function extractEvidenceOcrDescription_(text) {
  var lines = String(text || '').split(/\n+/).map(function (line) { return line.trim(); }).filter(Boolean);
  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i];
    if (/^[+-]?\s*[\d,]+\s*원$/.test(line)) continue;
    if (/20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2}/.test(line)) continue;
    if (/^(입금|출금|체크카드결제|카드\s*결제|송금|이자입금|캐시백|프로모션입금)$/.test(line)) continue;
    if (/^(거래 후 잔액|입금처|출금처|카테고리 설정|메모|댓글)/.test(line)) continue;
    return line.slice(0, 200);
  }
  return '';
}

function evaluateEvidenceOcrCandidate_(candidate, ledger) {
  candidate = candidate || {};
  ledger = ledger || {};
  if (candidate.amount == null || !candidate.transactionDate || !candidate.transactionType) return '확인필요';
  if (Number(candidate.amount) !== Number(ledger.amount || 0)) return '금액불일치';
  if (candidate.transactionDate !== String(ledger.transactionAt || '').slice(0, 10)) return '일자불일치';
  if (candidate.transactionType !== ledger.transactionType) return '확인필요';
  return '정상';
}
