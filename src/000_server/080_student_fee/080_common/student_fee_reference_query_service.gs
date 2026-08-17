// 1. 회비 금액 기준 전체 조회
function findAllFeeRateRows_() {
  return readOperationTableClientRows_('feeRates');
}

// 2. 학기 기준 전체/단건 조회
function findAllStudentFeeSemesterRows_() {
  return readOperationTableClientRows_('semesters');
}

function findStudentFeeSemesterById_(semesterId) {
  return findOperationTableRowById_('semesters', semesterId);
}

function assertValidStudentFeeSemester_(semesterId) {
  var row = findStudentFeeSemesterById_(semesterId);
  if (!row) throw new Error('학기기준을 찾을 수 없습니다: ' + semesterId);
  return row;
}

// 3. 날짜 비교용 yyyy-MM-dd 키 생성
function formatStudentFeeDateKey_(value) {
  if (value == null || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    if (typeof formatDateValue_ === 'function') return String(formatDateValue_(value)).slice(0, 10);
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim().slice(0, 10);
}

// 4. 학생회비 화면용 학기 기준 조회
function getStudentFeeReferenceData_() {
  var semesters = findAllStudentFeeSemesterRows_().map(function (row) {
    return {
      id: row.id,
      year: Number(row.year) || row.year,
      type: row.type,
      startDate: formatStudentFeeDateKey_(row.startDate),
      endDate: formatStudentFeeDateKey_(row.endDate),
      active: typeof isTruthyValue_ === 'function' ? isTruthyValue_(row.active) : !!row.active,
      label: String(row.year || '') + '학년도 ' + String(row.type || '')
    };
  });
  semesters.sort(function (a, b) {
    if (Number(a.year) !== Number(b.year)) return Number(b.year) - Number(a.year);
    return String(b.type || '').localeCompare(String(a.type || ''), 'ko');
  });
  return { semesters: semesters };
}

// 5. 지정일에 적용되는 회비 금액 기준 조회
function resolveStudentFeeRate_(targetDate) {
  var dateKey = formatStudentFeeDateKey_(targetDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error('회비금액기준 조회 날짜가 올바르지 않습니다.');
  }

  var matches = findAllFeeRateRows_().filter(function (row) {
    var start = formatStudentFeeDateKey_(row.startDate);
    var end = formatStudentFeeDateKey_(row.endDate);
    var active = typeof isTruthyValue_ === 'function' ? isTruthyValue_(row.active) : !!row.active;
    return active && start && end && start <= dateKey && dateKey <= end;
  });

  if (matches.length === 0) {
    throw new Error('해당 날짜에 적용할 회비금액기준이 없습니다: ' + dateKey);
  }
  if (matches.length > 1) {
    throw new Error('해당 날짜에 적용되는 회비금액기준이 여러 건입니다: ' + dateKey);
  }

  var amount = Number(matches[0].amountPerSemester);
  if (!isFinite(amount) || amount <= 0) {
    throw new Error('회비금액기준의 학기당금액이 올바르지 않습니다.');
  }
  return matches[0];
}
