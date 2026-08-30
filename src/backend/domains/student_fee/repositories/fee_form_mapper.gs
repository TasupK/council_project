// Google Form의 단일 응답을 Student Fee import DTO로 정규화한다.

function normalizeStudentFeeFormTitle_(value) {
  return String(value == null ? '' : value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function buildStudentFeeFormAliases_() {
  return {
    studentId: ['학번'],
    name: ['성명', '이름'],
    affiliation: ['소속', '학과'],
    paymentDate: ['납입날짜', '납부일', '입금일'],
    academicYearLevel: ['현재학년', '학년'],
    semesterWithinYear: ['현재학기', '학기'],
    coverageMode: ['납부유형', '신청유형'],
    studentCardFileId: ['학생카드캡쳐', '학생카드캡처', '학생카드'],
    depositFileId: ['입금내역캡쳐', '입금내역캡처', '입금캡쳐', '입금캡처']
  };
}

function resolveStudentFeeFormField_(title) {
  var normalized = normalizeStudentFeeFormTitle_(title);
  var aliases = buildStudentFeeFormAliases_();
  var fields = Object.keys(aliases);
  for (var i = 0; i < fields.length; i += 1) {
    var field = fields[i];
    for (var j = 0; j < aliases[field].length; j += 1) {
      if (normalizeStudentFeeFormTitle_(aliases[field][j]) === normalized) return field;
    }
  }
  return '';
}

function normalizeStudentFeeFormScalar_(value) {
  if (Array.isArray(value)) return value.length ? normalizeStudentFeeFormScalar_(value[0]) : '';
  return String(value == null ? '' : value).trim();
}

function parseStudentFeeFormDriveFileId_(value) {
  var text = normalizeStudentFeeFormScalar_(value);
  if (!text) return '';
  var match = text.match(/\/d\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  match = text.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  return text.indexOf('/') === -1 ? text : '';
}

function parseStudentFeeAcademicInteger_(value, fieldLabel, minimum, maximum) {
  var text = normalizeStudentFeeFormScalar_(value);
  var match = text.match(/\d+/);
  var number = match ? Number(match[0]) : NaN;
  if (!isFinite(number) || Math.floor(number) !== number || number < minimum || number > maximum) {
    throw new Error(fieldLabel + ' 값이 올바르지 않습니다.');
  }
  return number;
}

function normalizeStudentFeeCoverageMode_(value) {
  var text = normalizeStudentFeeFormScalar_(value).replace(/\s+/g, '').toUpperCase();
  if (!text) throw new Error('납부유형 값이 필요합니다.');
  if (text === 'STANDARD_REMAINING') return 'STANDARD_REMAINING';
  if (text === 'BROAD_FIRST_YEAR') return 'BROAD_FIRST_YEAR';
  if (text === 'BROAD_AFTER_ASSIGNMENT') return 'BROAD_AFTER_ASSIGNMENT';

  var lower = text.toLowerCase();
  if (lower.indexOf('광역') !== -1 && (lower.indexOf('추가') !== -1 || lower.indexOf('확정') !== -1)) {
    return 'BROAD_AFTER_ASSIGNMENT';
  }
  if (lower.indexOf('광역') !== -1 && (lower.indexOf('1학년') !== -1 || lower.indexOf('1차') !== -1)) {
    return 'BROAD_FIRST_YEAR';
  }
  if (lower.indexOf('일반') !== -1 || lower.indexOf('잔여') !== -1 || lower.indexOf('전체') !== -1) {
    return 'STANDARD_REMAINING';
  }
  throw new Error('납부유형 값을 해석할 수 없습니다: ' + normalizeStudentFeeFormScalar_(value));
}

function normalizeStudentFeeFormTimestamp_(value) {
  if (!value) throw new Error('원본응답일시를 확인할 수 없습니다.');
  var date = new Date(value);
  if (isNaN(date.getTime())) throw new Error('원본응답일시를 확인할 수 없습니다.');
  return date.toISOString();
}

function normalizeStudentFeePaymentDate_(value) {
  var text = normalizeStudentFeeFormScalar_(value);
  if (!text) throw new Error('납입날짜 값이 필요합니다.');
  var match = text.match(/(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);
  if (!match) throw new Error('납입날짜 값이 올바르지 않습니다.');
  return match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2);
}

function requireStudentFeeFormText_(answers, field, label) {
  var value = normalizeStudentFeeFormScalar_(answers[field]);
  if (!value) throw new Error(label + ' 값이 필요합니다.');
  return value;
}

function mapStudentFeeFormResponse_(formResponse) {
  if (!formResponse || typeof formResponse.getId !== 'function') {
    throw new Error('Google Form 응답 객체가 필요합니다.');
  }
  var sourceResponseId = String(formResponse.getId() || '').trim();
  if (!sourceResponseId) throw new Error('원본응답ID(Response ID)를 확인할 수 없습니다.');

  var answers = {};
  var itemResponses = typeof formResponse.getItemResponses === 'function' ? formResponse.getItemResponses() : [];
  (itemResponses || []).forEach(function (itemResponse) {
    if (!itemResponse || typeof itemResponse.getItem !== 'function') return;
    var item = itemResponse.getItem();
    var title = item && typeof item.getTitle === 'function' ? item.getTitle() : '';
    var field = resolveStudentFeeFormField_(title);
    if (!field || Object.prototype.hasOwnProperty.call(answers, field)) return;
    answers[field] = typeof itemResponse.getResponse === 'function' ? itemResponse.getResponse() : '';
  });

  var studentId = requireStudentFeeFormText_(answers, 'studentId', '학번');
  var name = requireStudentFeeFormText_(answers, 'name', '성명');
  var affiliation = requireStudentFeeFormText_(answers, 'affiliation', '소속');
  var paymentDate = normalizeStudentFeePaymentDate_(answers.paymentDate);
  var academicYearLevel = parseStudentFeeAcademicInteger_(answers.academicYearLevel, '현재학년', 1, 4);
  var semesterWithinYear = parseStudentFeeAcademicInteger_(answers.semesterWithinYear, '현재학기', 1, 2);
  var coverageMode = normalizeStudentFeeCoverageMode_(answers.coverageMode);

  return {
    sourceResponseId: sourceResponseId,
    sourceResponseAt: normalizeStudentFeeFormTimestamp_(formResponse.getTimestamp()),
    studentId: studentId,
    name: name,
    affiliation: affiliation,
    paymentDate: paymentDate,
    academicYearLevel: academicYearLevel,
    semesterWithinYear: semesterWithinYear,
    coverageMode: coverageMode,
    studentCardFileId: parseStudentFeeFormDriveFileId_(answers.studentCardFileId),
    depositFileId: parseStudentFeeFormDriveFileId_(answers.depositFileId)
  };
}
