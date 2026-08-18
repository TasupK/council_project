// Google Forms 응답 헤더/행을 Event 신청 도메인 값으로 변환한다.

function normalizeEventFormHeader_(value) {
  return String(value == null ? '' : value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/(을|를)?\s*입력해\s*주세요.*$/g, '')
    .replace(/(을|를)?\s*선택해\s*주세요.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildEventFormHeaderAliases_() {
  return {
    sourceResponseAt: ['타임스탬프', '응답일시', '제출일시', '신청일시'],
    sourceResponseId: ['응답ID', '응답 ID', '원본응답ID'],
    studentId: ['학번', '학생 학번'],
    name: ['성명', '이름', '학생 이름'],
    department: ['학과', '소속', '학과/소속'],
    phone: ['연락처', '전화번호', '휴대전화', '휴대폰 번호'],
    applicantType: ['신청자구분', '학생회비 납부 여부', '학생회비납부여부', '납부 여부'],
    bankName: ['은행', '은행명'],
    accountNumber: ['계좌번호', '계좌 번호'],
    accountHolder: ['예금주', '예금주명']
  };
}

function findEventFormAliasField_(header) {
  var normalized = normalizeEventFormHeader_(header).toLowerCase();
  var aliases = buildEventFormHeaderAliases_();
  var fields = Object.keys(aliases);
  for (var i = 0; i < fields.length; i += 1) {
    var field = fields[i];
    for (var j = 0; j < aliases[field].length; j += 1) {
      if (normalizeEventFormHeader_(aliases[field][j]).toLowerCase() === normalized) return field;
    }
  }
  return '';
}

function buildEventFormHeaderMap_(headers) {
  var byField = {};
  var recognized = {};
  (headers || []).forEach(function (header, index) {
    var field = findEventFormAliasField_(header);
    if (field && typeof byField[field] === 'undefined') {
      byField[field] = index;
      recognized[index] = true;
    }
  });
  return { byField: byField, recognized: recognized };
}

function readEventFormCell_(row, index) {
  if (typeof index === 'undefined' || index < 0) return '';
  return String(row[index] == null ? '' : row[index]).trim();
}

function normalizeEventFormApplicantType_(value) {
  var text = String(value == null ? '' : value).trim().toLowerCase();
  if (!text) return '';
  if (text.indexOf('미납') !== -1 || text.indexOf('비납') !== -1 || text.indexOf('non') !== -1) return '미납';
  if (text.indexOf('납부') !== -1 || text.indexOf('회원') !== -1 || text.indexOf('member') !== -1) return '납부';
  return '';
}

function calculateEventFormAppliedFee_(event, applicantType) {
  if (!event || !event.feeEnabled) return 0;
  if (applicantType === '납부') return Number(event.payerFee || 0);
  if (applicantType === '미납') return Number(event.nonPayerFee || 0);
  throwEventError_('VALIDATION_FAILED', '참가비가 있는 행사는 학생회비 납부 여부가 필요합니다.');
}

function hashEventFormResponseIdentity_(payload) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload);
  return 'form_' + digest.map(function (value) {
    var byte = value < 0 ? value + 256 : value;
    return ('0' + byte.toString(16)).slice(-2);
  }).join('').slice(0, 32);
}

function buildStableEventFormResponseId_(source, row, sourceResponseAt, studentId) {
  var parts = [String(source.responseSheetId || ''), String(source.sheetId || '')];
  if (sourceResponseAt && studentId) {
    parts.push(String(sourceResponseAt).trim(), String(studentId).trim());
  } else {
    parts.push((row || []).map(function (value) { return String(value == null ? '' : value).trim(); }).join('\u241f'));
  }
  return hashEventFormResponseIdentity_(parts.join('\u241e'));
}

function buildEventFormQuestionId_(header, index) {
  var normalized = normalizeEventFormHeader_(header).toLowerCase();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized + '|' + String(index));
  return 'q_' + digest.map(function (value) {
    var byte = value < 0 ? value + 256 : value;
    return ('0' + byte.toString(16)).slice(-2);
  }).join('').slice(0, 20);
}

function buildEventFormCandidates_(source, event) {
  var headers = source && source.headers ? source.headers : [];
  var rows = source && source.rows ? source.rows : [];
  var mapping = buildEventFormHeaderMap_(headers);
  if (typeof mapping.byField.studentId === 'undefined' || typeof mapping.byField.name === 'undefined') {
    throwEventError_('VALIDATION_FAILED', '응답 시트에 학번과 성명(또는 이름) 열이 필요합니다.');
  }

  var items = [];
  var invalidRows = [];
  rows.forEach(function (row, index) {
    var sourceRow = index + 2;
    var hasValue = (row || []).some(function (value) { return String(value == null ? '' : value).trim() !== ''; });
    if (!hasValue) return;
    var studentId = readEventFormCell_(row, mapping.byField.studentId);
    var name = readEventFormCell_(row, mapping.byField.name);
    if (!studentId || !name) {
      invalidRows.push({ row: sourceRow, reason: '학번 또는 성명 누락' });
      return;
    }

    var applicantType = normalizeEventFormApplicantType_(readEventFormCell_(row, mapping.byField.applicantType));
    var appliedFee;
    try {
      appliedFee = calculateEventFormAppliedFee_(event, applicantType);
    } catch (error) {
      invalidRows.push({ row: sourceRow, reason: error.message || '신청자 구분 확인 필요' });
      return;
    }

    var applicationId = Utilities.getUuid();
    var explicitResponseId = readEventFormCell_(row, mapping.byField.sourceResponseId);
    var sourceResponseAt = readEventFormCell_(row, mapping.byField.sourceResponseAt);
    var applicant = {
      id: applicationId,
      eventId: event.id,
      sourceResponseId: explicitResponseId || buildStableEventFormResponseId_(source, row, sourceResponseAt, studentId),
      sourceResponseAt: sourceResponseAt,
      studentId: studentId,
      name: name,
      department: readEventFormCell_(row, mapping.byField.department),
      phone: readEventFormCell_(row, mapping.byField.phone),
      applicantType: applicantType,
      appliedFee: appliedFee,
      bankName: readEventFormCell_(row, mapping.byField.bankName),
      accountNumber: readEventFormCell_(row, mapping.byField.accountNumber),
      accountHolder: readEventFormCell_(row, mapping.byField.accountHolder),
      status: '대기',
      importedAt: getCurrentIsoDateTime_(),
      managerId: '',
      processedAt: '',
      studentCardFileId: '',
      depositFileId: ''
    };

    var extraAnswers = [];
    headers.forEach(function (header, columnIndex) {
      if (mapping.recognized[columnIndex]) return;
      var answer = readEventFormCell_(row, columnIndex);
      if (!answer || !normalizeEventFormHeader_(header)) return;
      extraAnswers.push({
        id: Utilities.getUuid(),
        applicationId: applicationId,
        questionId: buildEventFormQuestionId_(header, columnIndex),
        questionTitle: String(header || '').trim(),
        answer: answer
      });
    });
    items.push({ applicant: applicant, extraAnswers: extraAnswers });
  });

  return { items: items, invalidRows: invalidRows };
}
