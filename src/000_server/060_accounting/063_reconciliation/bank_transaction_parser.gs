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
  return text.replace(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?=\s|$)/, function (_, year, month, day) {
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
