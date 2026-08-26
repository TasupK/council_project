/** Toss Bank Excel 행을 계좌거래 원본 모델로 정규화하는 pure parser */

var TOSS_BANK_TRANSACTION_HEADERS_ = [
  '거래 일시', '적요', '거래 유형', '거래 기관', '계좌번호', '거래 금액', '거래 후 잔액', '메모'
];

function parseTossBankTransactionRows_(rows) {
  return (rows || []).map(function (row, index) {
    row = row || {};
    var transactionAt = normalizeBankTransactionAt_(row['거래 일시']);
    var description = normalizeBankSourceText_(row['적요']);
    var bankType = normalizeBankSourceText_(row['거래 유형']);
    var institution = normalizeBankSourceText_(row['거래 기관']);
    var accountNumber = normalizeBankSourceText_(row['계좌번호']);
    var amount = parseSignedBankAmount_(row['거래 금액'], '거래 금액', index);
    var balanceAfter = parseOptionalBankAmount_(row['거래 후 잔액'], '거래 후 잔액', index);
    var memo = normalizeBankSourceText_(row['메모']);

    if (!transactionAt) throw new Error((index + 1) + '번째 거래의 거래 일시가 없습니다.');
    if (!description) throw new Error((index + 1) + '번째 거래의 적요가 없습니다.');
    if (!bankType) throw new Error((index + 1) + '번째 거래의 거래 유형이 없습니다.');

    return {
      transactionAt: transactionAt,
      description: description,
      bankType: bankType,
      institution: institution,
      counterpartyAccountNumber: accountNumber,
      amount: amount,
      balanceAfter: balanceAfter,
      memo: memo
    };
  });
}

function buildBankTransactionSourceString_(item) {
  item = item || {};
  return [
    normalizeBankTransactionAt_(item.transactionAt),
    normalizeBankSourceText_(item.description),
    normalizeBankSourceText_(item.bankType),
    normalizeBankSourceText_(item.institution),
    normalizeBankSourceText_(item.counterpartyAccountNumber),
    normalizeBankSourceNumber_(item.amount),
    item.balanceAfter === '' || item.balanceAfter == null ? '' : normalizeBankSourceNumber_(item.balanceAfter),
    normalizeBankSourceText_(item.memo)
  ].join('|');
}

function buildBankTransactionSourceHash_(item) {
  var source = buildBankTransactionSourceString_(item);
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    source,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (value) {
    var byte = value < 0 ? value + 256 : value;
    return ('0' + byte.toString(16)).slice(-2);
  }).join('');
}

function normalizeBankSourceText_(value) {
  if (value == null) return '';
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeBankTransactionAt_(value) {
  var text = normalizeBankSourceText_(value);
  if (!text) return '';
  var koreanDate = text.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (koreanDate) {
    return koreanDate[1] + '-' + ('0' + koreanDate[2]).slice(-2) + '-' + ('0' + koreanDate[3]).slice(-2) +
      (koreanDate[4] ? ' ' + ('0' + koreanDate[4]).slice(-2) + ':' + koreanDate[5] + (koreanDate[6] ? ':' + koreanDate[6] : '') : '');
  }
  return text.replace(/^(\d{4})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})(?=\s|$)/, function (_, year, month, day) {
    return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
  });
}

function normalizeBankSourceNumber_(value) {
  var number = Number(value);
  if (!isFinite(number)) throw new Error('계좌거래 숫자값이 유효하지 않습니다.');
  return String(number);
}

function parseSignedBankAmount_(value, label, index) {
  if (value == null || value === '') throw new Error((index + 1) + '번째 거래의 ' + label + '이 없습니다.');
  var normalized = typeof value === 'number'
    ? value
    : Number(String(value).replace(/,/g, '').replace(/원/g, '').trim());
  if (!isFinite(normalized)) throw new Error((index + 1) + '번째 거래의 ' + label + '이 유효한 숫자가 아닙니다.');
  return normalized;
}

function parseOptionalBankAmount_(value, label, index) {
  if (value == null || String(value).trim() === '') return '';
  return parseSignedBankAmount_(value, label, index);
}

function findTossBankHeaderRowIndex_(values) {
  for (var rowIndex = 0; rowIndex < Math.min((values || []).length, 30); rowIndex += 1) {
    var normalized = (values[rowIndex] || []).map(normalizeBankSourceText_);
    var found = TOSS_BANK_TRANSACTION_HEADERS_.every(function (header) {
      return normalized.indexOf(header) > -1;
    });
    if (found) return rowIndex;
  }
  return -1;
}

function mapTossBankSheetValuesToRows_(values) {
  var headerRowIndex = findTossBankHeaderRowIndex_(values || []);
  if (headerRowIndex < 0) throw new Error('토스뱅크 거래내역 헤더를 찾을 수 없습니다.');
  var headers = (values[headerRowIndex] || []).map(normalizeBankSourceText_);
  var headerIndexes = {};
  TOSS_BANK_TRANSACTION_HEADERS_.forEach(function (header) {
    headerIndexes[header] = headers.indexOf(header);
  });
  var rows = [];
  for (var rowIndex = headerRowIndex + 1; rowIndex < values.length; rowIndex += 1) {
    var source = values[rowIndex] || [];
    var hasTransaction = TOSS_BANK_TRANSACTION_HEADERS_.some(function (header) {
      var value = source[headerIndexes[header]];
      return value !== '' && value != null;
    });
    if (!hasTransaction) continue;
    var row = {};
    TOSS_BANK_TRANSACTION_HEADERS_.forEach(function (header) {
      row[header] = source[headerIndexes[header]];
    });
    rows.push(row);
  }
  return rows;
}

function parseTossBankOcrTextToRows_(ocrText) {
  var text = normalizeTossBankOcrText_(ocrText);
  var detailRow = parseTossBankDetailScreenshotOcr_(text);
  if (detailRow) return [detailRow];
  if (/(거래 후 잔액|받는 분 통장표시|거래한 모임원)/.test(text)) {
    throw new Error(buildTossBankDetailOcrFailureMessage_(text));
  }
  var datePattern = /20\d{2}(?:\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|\s*[.\/-]\s*\d{1,2}\s*[.\/-]\s*\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/g;
  var matches = [];
  var match;
  while ((match = datePattern.exec(text)) !== null) matches.push({ index: match.index, value: match[0] });

  var rows = [];
  for (var i = 0; i < matches.length; i += 1) {
    var block = text.slice(matches[i].index, i + 1 < matches.length ? matches[i + 1].index : text.length);
    var row = parseTossBankOcrBlock_(block, matches[i].value);
    if (row) rows.push(row);
  }
  if (!rows.length) {
    throw new Error('PDF 또는 이미지에서 토스뱅크 거래내역을 인식하지 못했습니다. 날짜와 금액이 선명한 파일인지 확인해 주세요.');
  }
  return rows;
}

function normalizeTossBankOcrText_(value) {
  var text = String(value || '');
  try { text = text.normalize('NFKC'); } catch (normalizeError) {}
  text = text
    .replace(/\r\n?/g, '\n')
    .replace(/[−–—－﹣]/g, '-')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ');
  var labels = [
    '소비 합계에서 제외', '받는 분 통장표시', '거래한 모임원', '거래 후 잔액',
    '카테고리 설정', '거래 유형', '거래 금액', '거래 기관', '계좌번호',
    '입금처', '출금처', '일시', '적요', '메모', '댓글'
  ];
  labels.forEach(function (label) {
    var flexible = label.replace(/\s/g, '').split('').map(function (character) {
      return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('\\s*');
    text = text.replace(new RegExp(flexible, 'g'), label);
  });
  return text;
}

function parseTossBankDetailScreenshotOcr_(text) {
  var lines = String(text || '').split(/\n+/).map(function (line) {
    return normalizeBankSourceText_(line);
  }).filter(Boolean);
  var transactionAt = extractTossBankOcrLabeledValue_(text, '일시');
  if (!hasTossBankOcrDate_(transactionAt)) transactionAt = extractTossBankOcrDateTime_(text);
  var amountResult = extractTossBankDetailAmounts_(text, transactionAt);
  if (!transactionAt || !amountResult) return null;

  var bankType = normalizeTossBankOcrType_(extractTossBankOcrLabeledValue_(text, '거래 유형')) ||
    extractTossBankStandaloneType_(lines, text) || (amountResult.amount < 0 ? '출금' : '입금');
  var amount = amountResult.amount;
  if (isTossBankOutgoingType_(bankType)) amount = -Math.abs(amount);
  if (isTossBankIncomingType_(bankType)) amount = Math.abs(amount);

  var description = extractTossBankOcrLabeledValue_(text, '적요');
  if (!isTossBankDetailDescription_(description)) {
    description = extractTossBankDetailDescription_(text, lines, transactionAt, amountResult);
  }
  if (!description) description = '거래처 확인 필요';

  var destination = extractTossBankOcrLabeledValue_(text, '입금처');
  var balance = extractTossBankOcrLabeledValue_(text, '거래 후 잔액');
  var memo = extractTossBankOcrLabeledValue_(text, '메모');
  if (/^(남기기|없음|미입력)\s*>?$/.test(memo)) memo = '';
  var parsedBalance = /^[+-]?\s*\d[\d,\s]*\s*원?$/.test(normalizeBankSourceText_(balance))
    ? parseBankOcrNumber_(balance.replace(/원/g, ''))
    : amountResult.balance;

  return {
    '거래 일시': transactionAt,
    '적요': description,
    '거래 유형': bankType,
    '거래 기관': extractTossBankInstitution_(destination || text),
    '계좌번호': extractTossBankOcrAccountNumber_(destination || text),
    '거래 금액': amount,
    '거래 후 잔액': parsedBalance,
    '메모': memo
  };
}

function extractTossBankOcrDateTime_(text) {
  var found = findTossBankOcrDateMatch_(text);
  return found ? found.value : '';
}

function hasTossBankOcrDate_(value) {
  return !!findTossBankOcrDateMatch_(value);
}

function findTossBankOcrDateMatch_(text) {
  var source = String(text || '');
  var korean = source.match(/(2\s*0\s*\d\s*\d)\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?)?/);
  if (korean) {
    var koreanYear = korean[1].replace(/\s/g, '');
    var koreanValue = koreanYear + '년 ' + Number(korean[2]) + '월 ' + Number(korean[3]) + '일';
    if (korean[4]) koreanValue += ' ' + ('0' + korean[4]).slice(-2) + ':' + korean[5] + (korean[6] ? ':' + korean[6] : '');
    return { value: koreanValue, index: korean.index, raw: korean[0] };
  }
  var numeric = source.match(/(2\s*0\s*\d\s*\d)\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.]?\s*(?:(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?)?/);
  if (!numeric) return null;
  var numericValue = numeric[1].replace(/\s/g, '') + '-' + ('0' + numeric[2]).slice(-2) + '-' + ('0' + numeric[3]).slice(-2);
  if (numeric[4]) numericValue += ' ' + ('0' + numeric[4]).slice(-2) + ':' + numeric[5] + (numeric[6] ? ':' + numeric[6] : '');
  return { value: numericValue, index: numeric.index, raw: numeric[0] };
}

function extractTossBankDetailAmounts_(text, transactionAt) {
  var source = String(text || '');
  var dateMatch = findTossBankOcrDateMatch_(source);
  var dateIndex = dateMatch ? dateMatch.index : -1;
  var monetary = [];
  var moneyPattern = /([+-]?\s*\d{1,3}(?:\s*,\s*\d{3})+)(?:\s*원)?/g;
  var match;
  while ((match = moneyPattern.exec(source)) !== null) {
    var value = parseBankOcrNumber_(match[1]);
    if (!isFinite(value) || Math.abs(value) < 1000) continue;
    monetary.push({
      amount: value,
      index: match.index,
      sourceText: normalizeBankSourceText_(match[1]),
      context: normalizeBankSourceText_(source.slice(Math.max(0, match.index - 35), Math.min(source.length, moneyPattern.lastIndex + 20)))
    });
  }
  var transaction = null;
  for (var i = 0; i < monetary.length; i += 1) {
    if (/^[+-]/.test(monetary[i].sourceText) && !/거래\s*후\s*잔액/.test(monetary[i].context)) { transaction = monetary[i]; break; }
  }
  if (!transaction && dateIndex > -1) {
    for (var before = 0; before < monetary.length; before += 1) {
      if (monetary[before].index < dateIndex && !/거래\s*후\s*잔액/.test(monetary[before].context)) { transaction = monetary[before]; break; }
    }
  }
  if (!transaction) {
    for (var candidate = 0; candidate < monetary.length; candidate += 1) {
      if (!/거래\s*후\s*잔액/.test(monetary[candidate].context)) { transaction = monetary[candidate]; break; }
    }
  }
  if (!transaction) return null;

  var balance = '';
  for (var j = monetary.length - 1; j >= 0; j -= 1) {
    if (monetary[j].index !== transaction.index && (/거래\s*후\s*잔액/.test(monetary[j].context) || monetary[j].index > dateIndex)) {
      balance = Math.abs(monetary[j].amount);
      break;
    }
  }
  return { amount: transaction.amount, balance: balance, sourceText: transaction.sourceText, index: transaction.index };
}

function extractTossBankStandaloneType_(lines, text) {
  for (var i = 0; i < (lines || []).length; i += 1) {
    var compact = String(lines[i] || '').replace(/\s+/g, '');
    if (/^(출금|입금)$/.test(compact)) return compact;
  }
  var flattened = String(text || '').match(/(?:^|\s)(출\s*금|입\s*금)(?=\s|$)/);
  if (flattened) return flattened[1].replace(/\s+/g, '');
  return '';
}

function isTossBankDetailDescription_(value) {
  var text = normalizeBankSourceText_(value);
  if (!text || hasTossBankOcrDate_(text)) return false;
  if (/^[+-]?\s*\d[\d,\s]*\s*원?$/.test(text)) return false;
  if (/^(출금|입금|송금|이체|남기기|없음|미입력)$/.test(text.replace(/\s+/g, ''))) return false;
  return !isTossBankOcrLabelLine_(text);
}

function extractTossBankDetailDescription_(text, lines, transactionAt, amountResult) {
  var dateIndex = -1;
  var amountIndex = -1;
  for (var i = 0; i < (lines || []).length; i += 1) {
    if (dateIndex < 0 && hasTossBankOcrDate_(lines[i])) dateIndex = i;
    if (amountIndex < 0 && amountResult.sourceText && lines[i].indexOf(amountResult.sourceText) > -1) amountIndex = i;
  }
  if (dateIndex > -1) {
    for (var after = dateIndex + 1; after < lines.length; after += 1) {
      if (isTossBankDetailDescriptionCandidate_(lines[after])) return lines[after].slice(0, 200);
    }
  }
  if (amountIndex > 0) {
    for (var before = amountIndex - 1; before >= Math.max(0, amountIndex - 4); before -= 1) {
      if (isTossBankDetailDescriptionCandidate_(lines[before])) return lines[before].slice(0, 200);
    }
  }
  var source = String(text || '');
  if (amountResult.index > 0) {
    var headerWords = source.slice(Math.max(0, amountResult.index - 120), amountResult.index).match(/[가-힣]{2,12}/g) || [];
    for (var headerIndex = headerWords.length - 1; headerIndex >= 0; headerIndex -= 1) {
      if (isTossBankDetailDescriptionCandidate_(headerWords[headerIndex])) return headerWords[headerIndex];
    }
  }
  var foundDate = findTossBankOcrDateMatch_(source);
  if (foundDate) {
    var following = source.slice(foundDate.index + foundDate.raw.length, foundDate.index + foundDate.raw.length + 160).match(/[가-힣]{2,12}/g) || [];
    for (var followingIndex = 0; followingIndex < following.length; followingIndex += 1) {
      if (isTossBankDetailDescriptionCandidate_(following[followingIndex])) return following[followingIndex];
    }
  }
  return '';
}

function buildTossBankDetailOcrFailureMessage_(text) {
  var missing = [];
  var date = extractTossBankOcrDateTime_(text);
  if (!date) missing.push('거래일을 찾지 못함');
  if (!extractTossBankDetailAmounts_(text, date)) missing.push('거래금액을 찾지 못했거나 잔액과 구분하지 못함');
  if (!String(text || '').trim()) missing.push('OCR 텍스트가 비어 있음');
  return '토스뱅크 상세 거래를 인식하지 못했습니다: ' + (missing.length ? missing.join(', ') : '거래 구조를 판별하지 못함');
}

function isTossBankDetailDescriptionCandidate_(value) {
  var text = normalizeBankSourceText_(value);
  if (!isTossBankDetailDescription_(text)) return false;
  if (/^\d{1,2}:\d{2}$/.test(text)) return false;
  if (/\b\d{2,6}(?:[- ]\d{2,8}){1,3}\b/.test(text)) return false;
  if (/(토스뱅크|국민은행|농협|은행|거래 후 잔액|통장표시)/.test(text)) return false;
  if (/^(복사|기타|댓글|카테고리 설정|소비 합계에서 제외)$/.test(text)) return false;
  return true;
}

function extractTossBankOcrLabeledValue_(text, label) {
  var lines = String(text || '').split(/\n+/).map(function (line) {
    return normalizeBankSourceText_(line);
  }).filter(Boolean);
  var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  var labelPattern = new RegExp('(?:^|\\s)' + escaped + '[ \\t]*[:：]?[ \\t]*(.*)$');
  for (var i = 0; i < lines.length; i += 1) {
    var match = lines[i].match(labelPattern);
    if (!match) continue;
    var inlineValue = trimTossBankOcrValueAtNextLabel_(match[1]);
    if (inlineValue) return inlineValue;
    if (i + 1 < lines.length && !isTossBankOcrLabelLine_(lines[i + 1])) {
      return trimTossBankOcrValueAtNextLabel_(lines[i + 1]);
    }
  }
  return '';
}

function trimTossBankOcrValueAtNextLabel_(value) {
  var text = normalizeBankSourceText_(value).replace(/\s*>$/, '').trim();
  var nextLabel = text.search(/\s+(?:일시|적요|거래 유형|거래한 모임원|입금처|출금처|거래 후 잔액|받는 분 통장표시|카테고리 설정|메모|댓글|소비 합계에서 제외)(?:\s|[:：]|$)/);
  return (nextLabel > -1 ? text.slice(0, nextLabel) : text).trim();
}

function isTossBankOcrLabelLine_(line) {
  return /^(일시|적요|거래 유형|거래한 모임원|입금처|출금처|거래 후 잔액|받는 분 통장표시|카테고리 설정|메모|댓글|소비 합계에서 제외)(?:\s|[:：]|$)/.test(normalizeBankSourceText_(line));
}

function extractTossBankInstitution_(value) {
  var text = normalizeBankSourceText_(value);
  var known = text.match(/(토스뱅크|KB국민은행|국민은행|NH농협은행|농협은행|신한은행|우리은행|하나은행|카카오뱅크|케이뱅크|기업은행|IBK기업은행|새마을금고|신협|우체국)/);
  if (known) return known[1];
  return text.replace(/\b\d{2,6}(?:[- ]\d{2,8}){1,3}\b.*$/, '').trim();
}

function parseTossBankOcrBlock_(block, transactionAt) {
  var lines = String(block || '').split(/\n+/).map(function (line) {
    return normalizeBankSourceText_(line);
  }).filter(Boolean);
  var bankType = extractTossBankOcrType_(block);
  var amounts = extractTossBankOcrAmounts_(block);
  if (!amounts.length) return null;

  var amount = amounts[0];
  if (isTossBankOutgoingType_(bankType)) amount = -Math.abs(amount);
  if (isTossBankIncomingType_(bankType)) amount = Math.abs(amount);
  var balanceMatch = String(block).match(/거래\s*후\s*잔액\s*[:：]?\s*(?:₩|￦)?\s*([+-]?[\d,]+)\s*원?/);
  var balance = balanceMatch ? parseBankOcrNumber_(balanceMatch[1]) : (amounts.length > 1 ? amounts[1] : '');

  return {
    '거래 일시': transactionAt,
    '적요': extractTossBankOcrField_(block, '적요') || extractTossBankOcrDescription_(lines) || 'OCR 거래',
    '거래 유형': bankType || (amount < 0 ? '출금' : '입금'),
    '거래 기관': extractTossBankOcrField_(block, '거래 기관'),
    '계좌번호': extractTossBankOcrAccountNumber_(block),
    '거래 금액': amount,
    '거래 후 잔액': balance,
    '메모': extractTossBankOcrField_(block, '메모')
  };
}

function extractTossBankOcrType_(text) {
  var compact = String(text || '').replace(/\s+/g, '');
  var types = ['체크카드결제', '카드결제', '자동이체', 'ATM출금', '이자입금', '프로모션입금', '캐시백', '환불', '출금', '송금', '이체', '입금'];
  for (var i = 0; i < types.length; i += 1) {
    if (compact.indexOf(types[i]) > -1) return types[i] === '카드결제' ? '카드 결제' : types[i];
  }
  return '';
}

function normalizeTossBankOcrType_(value) {
  return extractTossBankOcrType_(value);
}

function isTossBankOutgoingType_(type) {
  return /출금|결제|송금|이체/.test(type) && !/입금/.test(type);
}

function isTossBankIncomingType_(type) {
  return /입금|캐시백|환불/.test(type);
}

function extractTossBankOcrAmounts_(text) {
  var result = [];
  var pattern = /(?:₩|￦)?\s*([+-]?\s*\d[\d,]*)\s*원/g;
  var match;
  while ((match = pattern.exec(String(text))) !== null) result.push(parseBankOcrNumber_(match[1]));
  if (result.length) return result;
  var labeled = String(text).match(/거래\s*금액\s*[:：]?\s*(?:₩|￦)?\s*([+-]?\s*\d[\d,]*)/);
  return labeled ? [parseBankOcrNumber_(labeled[1])] : [];
}

function parseBankOcrNumber_(value) {
  return Number(String(value).replace(/[\s,]/g, ''));
}

function extractTossBankOcrField_(text, label) {
  return extractTossBankOcrLabeledValue_(text, label).slice(0, 200);
}

function extractTossBankOcrAccountNumber_(text) {
  var labeled = extractTossBankOcrField_(text, '계좌번호');
  if (labeled) return labeled;
  var match = String(text).match(/\b\d{2,6}(?:[- ]\d{2,8}){1,3}\b/);
  return match ? normalizeBankSourceText_(match[0]) : '';
}

function extractTossBankOcrDescription_(lines) {
  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i];
    if (/20\d{2}(?:\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|\s*[.\/-]\s*\d{1,2}\s*[.\/-]\s*\d{1,2})/.test(line)) continue;
    if (/(?:₩|￦)?\s*[+-]?\s*\d[\d,]*\s*원/.test(line)) continue;
    if (/^(체크카드결제|카드 결제|자동이체|ATM출금|이자입금|프로모션입금|캐시백|환불|출금|송금|이체|입금)$/.test(line)) continue;
    if (/^(토스뱅크|거래내역|거래 내역|거래 상세|계좌 거래|확인|닫기|메모|댓글)$/.test(line)) continue;
    if (/^(거래 일시|적요|거래 유형|거래 기관|계좌번호|거래 금액|거래 후 잔액)\s*[:：]?/.test(line)) continue;
    if (/^\d{2,6}(?:[- ]\d{2,8}){1,3}$/.test(line)) continue;
    return line.slice(0, 200);
  }
  return '';
}
