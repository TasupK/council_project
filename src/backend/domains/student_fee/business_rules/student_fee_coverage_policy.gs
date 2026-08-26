// 학생회비 신청의 적용 학기 범위를 계산한다.

function requireStudentFeeCoverageInteger_(value, fieldName, minimum, maximum) {
  var number = Number(value);
  if (!isFinite(number) || Math.floor(number) !== number || number < minimum || number > maximum) {
    throw new Error(fieldName + ' 값은 ' + minimum + '~' + maximum + ' 범위의 정수여야 합니다.');
  }
  return number;
}

function calculateStudentFeeCoverage_(input) {
  var source = input && typeof input === 'object' ? input : {};
  var currentSemesterId = String(source.currentSemesterId || '').trim();
  if (!currentSemesterId) throw new Error('currentSemesterId 값이 필요합니다.');

  var academicYearLevel = requireStudentFeeCoverageInteger_(source.academicYearLevel, 'academicYearLevel', 1, 4);
  var semesterWithinYear = requireStudentFeeCoverageInteger_(source.semesterWithinYear, 'semesterWithinYear', 1, 2);
  var coverageMode = String(source.coverageMode || '').trim().toUpperCase();
  var supportedModes = ['STANDARD_REMAINING', 'BROAD_FIRST_YEAR', 'BROAD_AFTER_ASSIGNMENT'];
  if (supportedModes.indexOf(coverageMode) < 0) {
    throw new Error('coverageMode 값이 올바르지 않습니다: ' + coverageMode);
  }

  if (coverageMode === 'BROAD_FIRST_YEAR') {
    if (academicYearLevel !== 1) throw new Error('BROAD_FIRST_YEAR는 1학년 신청에만 사용할 수 있습니다.');
    return { startSemesterId: currentSemesterId, semesterCount: 2 };
  }

  var academicTermOrdinal = (academicYearLevel - 1) * 2 + semesterWithinYear;
  return {
    startSemesterId: currentSemesterId,
    semesterCount: 9 - academicTermOrdinal
  };
}
