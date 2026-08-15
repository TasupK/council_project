// 1. 행사 행 조회
function findAllEventRows_() {
  return readOperationTableRows_('events');
}

function findAllEventClientRows_() {
  return readOperationTableClientRows_('events');
}

function findEventRowById_(eventId) {
  return findOperationTableRowById_('events', eventId);
}

// 2. 행사 행 저장
function insertEventRow_(event) {
  return appendOperationTableRow_('events', event);
}

function updateEventRowById_(eventId, changes) {
  return updateOperationTableRow_('events', eventId, changes);
}
