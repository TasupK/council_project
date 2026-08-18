// 1. 행사 신청 행 조회
function findAllEventApplicationClientRows_() {
  return readOperationTableClientRows_('eventApplications');
}

function findEventApplicationRowById_(applicationId) {
  return findOperationTableRowById_('eventApplications', applicationId);
}

function findAllEventApplicationSourceResponseIds_() {
  return findAllEventApplicationClientRows_().map(function (row) {
    return String(row.sourceResponseId || '').trim();
  }).filter(function (value) { return !!value; });
}

function findEventFormByEventId_(eventId) {
  return readOperationTableClientRows_('eventForms').find(function (row) {
    return String(row.eventId) === String(eventId);
  }) || null;
}

// 2. 행사 신청/추가답변/폼 행 저장
function insertEventApplicationRow_(item) {
  return appendOperationTableRow_('eventApplications', item);
}

function insertEventExtraAnswerRow_(item) {
  return appendOperationTableRow_('eventExtraAnswers', item);
}

function insertEventFormRow_(item) {
  return appendOperationTableRow_('eventForms', item);
}

function updateEventApplicationRowById_(applicationId, changes) {
  return updateOperationTableRow_('eventApplications', applicationId, changes);
}

function updateEventFormRowById_(eventFormId, changes) {
  return updateOperationTableRow_('eventForms', eventFormId, changes);
}
