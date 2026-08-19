// 1. 회비납부자 생성
function createFeePayerData_(request, context) {
  var studentId = requireStudentFeeText_(request && request.studentId, 'studentId');
  var name = requireStudentFeeText_(request && request.name, 'name');
  var affiliation = requireStudentFeeText_(request && request.affiliation, 'affiliation');
  var startSemesterId = requireStudentFeeText_(request && request.startSemesterId, 'startSemesterId');
  var actorEmail = requireStudentFeeText_(context && context.email, 'actorEmail');

  if (findFeePayerRowById_(studentId)) {
    throw new Error('이미 등록된 학번입니다: ' + studentId);
  }
  assertValidStudentFeeSemester_(startSemesterId);

  var row = {
    studentId: studentId,
    name: name,
    affiliation: affiliation,
    startSemesterId: startSemesterId,
    managerEmail: actorEmail,
    updatedAt: getCurrentIsoDateTime_()
  };
  insertFeePayerRow_(row);
  writeStudentFeeAudit_(actorEmail, '생성', 'feePayers', studentId, '', JSON.stringify(row), '');
  return row;
}

// 2. 회비납부자 수정
function updateFeePayerData_(request, context) {
  var studentId = requireStudentFeeId_(request, ['studentId', 'id']);
  var actorEmail = requireStudentFeeText_(context && context.email, 'actorEmail');
  var before = findFeePayerRowById_(studentId);
  if (!before) throw new Error('회비납부자를 찾을 수 없습니다: ' + studentId);

  var changes = {};
  if (request && Object.prototype.hasOwnProperty.call(request, 'name')) {
    changes.name = requireStudentFeeText_(request.name, 'name');
  }
  if (request && Object.prototype.hasOwnProperty.call(request, 'affiliation')) {
    changes.affiliation = requireStudentFeeText_(request.affiliation, 'affiliation');
  }
  if (request && Object.prototype.hasOwnProperty.call(request, 'startSemesterId')) {
    changes.startSemesterId = requireStudentFeeText_(request.startSemesterId, 'startSemesterId');
    assertValidStudentFeeSemester_(changes.startSemesterId);
  }
  if (!Object.keys(changes).length) throw new Error('수정할 회비납부자 정보가 없습니다.');

  changes.managerEmail = actorEmail;
  changes.updatedAt = getCurrentIsoDateTime_();
  updateFeePayerRowById_(studentId, changes);

  var after = {};
  Object.keys(before).forEach(function (key) { after[key] = before[key]; });
  Object.keys(changes).forEach(function (key) { after[key] = changes[key]; });
  delete after._rowNumber;

  writeStudentFeeAudit_(actorEmail, '수정', 'feePayers', studentId, JSON.stringify(before), JSON.stringify(after), '');
  return after;
}
