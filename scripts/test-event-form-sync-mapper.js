var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var mapperPath = path.join(ROOT, 'src/backend/domains/event/repositories/applicant_form_mapper.gs');
var readerPath = path.join(ROOT, 'src/backend/domains/event/repositories/applicant_form_reader.gs');
assert.ok(fs.existsSync(mapperPath), 'applicant_form_mapper.gs must exist');
assert.ok(fs.existsSync(readerPath), 'applicant_form_reader.gs must exist');

var context = vm.createContext({
  console: console,
  String: String,
  Number: Number,
  Boolean: Boolean,
  Object: Object,
  Array: Array,
  JSON: JSON,
  Math: Math,
  Date: Date,
  Utilities: {
    getUuid: function () { return 'uuid-test'; },
    computeDigest: function (_, value) {
      var text = String(value || '');
      var bytes = [];
      for (var i = 0; i < 20; i += 1) bytes.push((text.charCodeAt(i % Math.max(1, text.length)) || i) & 255);
      return bytes;
    },
    DigestAlgorithm: { SHA_256: 'SHA_256' }
  },
  normalizeEventText_: function (value) { return String(value == null ? '' : value).trim(); },
  getCurrentIsoDateTime_: function () { return '2026-08-18T20:00:00+09:00'; },
  throwEventError_: function (code, message, details) {
    var error = new Error(message); error.code = code; error.details = details; throw error;
  }
});
vm.runInContext(fs.readFileSync(mapperPath, 'utf8'), context, { filename: mapperPath });

assert.strictEqual(context.normalizeEventFormHeader_('  성명 (실명)  '), '성명');
assert.strictEqual(context.resolveEventFormAliasField_('학생 이름'), 'name');
assert.strictEqual(context.resolveEventFormAliasField_('학번을 입력해주세요'), 'studentId');

var source = {
  responseSheetId: 'sheet-source-1',
  sheetId: 77,
  sheetName: '설문지 응답 시트1',
  headers: ['타임스탬프', '학번', '성명', '연락처', '학생회비 납부 여부', '티셔츠 사이즈'],
  rows: [
    ['2026. 8. 18 오후 1:00:00', '6001', '김학생', '010-1111-2222', '납부', 'L'],
    ['2026. 8. 18 오후 1:10:00', '', '이누락', '', '미납', 'M']
  ]
};
var event = { id: 'EVT-1', feeEnabled: true, payerFee: 5000, nonPayerFee: 10000 };
var mapped = context.buildEventFormCandidates_(source, event);
assert.strictEqual(mapped.items.length, 1);
assert.strictEqual(mapped.invalidRows.length, 1);
assert.strictEqual(mapped.items[0].applicant.studentId, '6001');
assert.strictEqual(mapped.items[0].applicant.name, '김학생');
assert.strictEqual(mapped.items[0].applicant.appliedFee, 5000);
assert.strictEqual(mapped.items[0].extraAnswers.length, 1);
assert.strictEqual(mapped.items[0].extraAnswers[0].questionTitle, '티셔츠 사이즈');
assert.strictEqual(mapped.items[0].extraAnswers[0].answer, 'L');
assert.ok(mapped.items[0].applicant.sourceResponseId.indexOf('form_') === 0);

var reordered = {
  responseSheetId: source.responseSheetId,
  sheetId: source.sheetId,
  sheetName: source.sheetName,
  headers: source.headers,
  rows: [source.rows[1], source.rows[0]]
};
var remapped = context.buildEventFormCandidates_(reordered, event);
assert.strictEqual(remapped.items[0].applicant.sourceResponseId, mapped.items[0].applicant.sourceResponseId, 'fallback sourceResponseId must not depend on row number');

assert.throws(function () {
  context.buildEventFormCandidates_({ responseSheetId: 'x', sheetId: 1, headers: ['연락처'], rows: [['010']] }, event);
}, function (error) { return error.code === 'VALIDATION_FAILED'; });

console.log('Event Form mapper/reader contract passed.');
