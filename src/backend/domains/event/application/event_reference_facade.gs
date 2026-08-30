/** Accounting 등 다른 도메인에 공개하는 Event 기준정보 Application facade */
function listAccountingEventReferences_() {
  return listEventRows_().map(function (row) {
    return {
      id: row.id,
      name: row.name || '',
      status: row.status || '',
      startAt: row.startAt || '',
      endAt: row.endAt || ''
    };
  });
}
