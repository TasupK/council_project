/** OCR 텍스트에서 계좌 수입/지출 거래를 추출하는 pure parser */

function parseBankOcrTransactions_(ocrText, fileName, baseYear) {
  var lines = String(ocrText || '').replace(/\r/g, '\n').split(/\n+/).map(function (line) {
    return line.replace(/[\u00a0\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
  var blocks = buildBankTransactionBlocks_(lines);
  var items = [];
  var reviewRequiredItems = [];
  blocks.forEach(function (block, index) {
    var parsed = parseBankTransactionBlock_(block, baseYear);
    if (parsed.reviewReason) {
      reviewRequiredItems.push({ sourceFileName: fileName, sourceIndex: index, reason: parsed.reviewReason });
      return;
    }
    items.push({
      transactionAt: parsed.transactionAt,
      expense: parsed.expense,
      counterparty: parsed.counterparty,
      description: parsed.description,
      amount: parsed.amount,
      sourceFileName: fileName
    });
  });
  return { items: items, reviewRequiredItems: reviewRequiredItems, extractedCount: blocks.length };
}

function buildBankTransactionBlocks_(lines) {
  var blocks = [], current = [];
  lines.forEach(function (line) {
    if (containsBankDate_(line)) {
      if (current.length) blocks.push(current);
      current = [line];
    } else if (current.length && current.length < 10) {
      current.push(line);
    }
  });
  if (current.length) blocks.push(current);
  return blocks;
}

function parseBankTransactionBlock_(block, baseYear) {
  var text = block.join('\n');
  var transactionAt = extractBankDate_(text, baseYear);
  if (!transactionAt) return { reviewReason: '거래일을 확인할 수 없습니다.' };
  var expenseMatch = text.match(/(?:출금(?:액)?|지출|이체출금|자동이체|카드\s*결제|체크\s*카드|송금|ATM\s*출금)\s*[:：]?\s*-?\s*(?:₩|￦)?\s*([\d,]+)\s*원?/i);
  var incomeMatch = text.match(/(?:입금(?:액)?|수입|이체입금|급여|환급)\s*[:：]?\s*\+?\s*(?:₩|￦)?\s*([\d,]+)\s*원?/i);
  if (expenseMatch && incomeMatch) return { reviewReason: '입금과 출금 방향이 동시에 인식되었습니다.' };
  if (!expenseMatch && !incomeMatch) return { reviewReason: '입금과 출금 중 어느 거래인지 확인할 수 없습니다.' };
  var amount = parseBankAmount_((expenseMatch || incomeMatch)[1]);
  if (!amount) return { reviewReason: '거래금액을 확인할 수 없습니다.' };
  var counterparty = extractBankCounterparty_(block);
  if (!counterparty) return { reviewReason: '거래상대명을 확인할 수 없습니다.' };
  return {
    transactionAt: transactionAt,
    expense: Boolean(expenseMatch),
    amount: amount,
    counterparty: counterparty,
    description: extractBankDescription_(text)
  };
}

function containsBankDate_(value) {
  return /(?:20\d{2}[.\/-]\s*\d{1,2}[.\/-]\s*\d{1,2}|20\d{2}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|(?:^|\s)\d{1,2}[.\/-]\s*\d{1,2}(?:\s|$)|\d{1,2}\s*월\s*\d{1,2}\s*일)/.test(String(value || ''));
}

function extractBankDate_(value, baseYear) {
  var text = String(value || '');
  var match = text.match(/(20\d{2})\s*(?:[.\/-]|년)\s*(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?/);
  var year, month, day;
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = text.match(/(?:^|\s)(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?(?:\s|$)/);
    if (!match) return '';
    year = Number(baseYear) || new Date().getFullYear(); month = Number(match[1]); day = Number(match[2]);
  }
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function parseBankAmount_(value) { return Number(String(value || '').replace(/[^0-9]/g, '')) || 0; }

function extractBankCounterparty_(block) {
  var ignored = /(?:20\d{2}|출금|입금|지출|수입|이체|카드|송금|ATM|적요|거래\s*내용|내용|잔액|원$)/i;
  for (var i = 1; i < block.length; i += 1) {
    var line = String(block[i] || '').trim();
    if (!line || ignored.test(line)) continue;
    if (/^[\d,]+\s*원?$/.test(line)) continue;
    return line.slice(0, 120);
  }
  return '';
}

function extractBankDescription_(text) {
  var match = String(text || '').match(/(?:거래\s*내용|적요|내용)\s*[:：]?\s*([^\n]+)/i);
  return match ? String(match[1] || '').trim().slice(0, 200) : '';
}
