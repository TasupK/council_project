function buildEventPayload_(payload, requireAll) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var fields = [
    'name', 'category', 'status', 'managerId',
    'applicationStartAt', 'applicationEndAt', 'eventStartAt', 'eventEndAt',
    'capacity', 'payerFee', 'nonPayerFee', 'description', 'evidenceFolderId'
  ];
  var optionalTextFields = ['evidenceFolderId', 'eventEndAt'];
  var result = {};

  fields.forEach(function (field) {
    if (!requireAll && !Object.prototype.hasOwnProperty.call(source, field)) return;
    var value = source[field];
    if (optionalTextFields.indexOf(field) >= 0) {
      result[field] = normalizeEventText_(value);
      return;
    }
    if (field === 'capacity' || field === 'payerFee' || field === 'nonPayerFee') {
      result[field] = parseEventNumber_(value, field, 0);
    } else if (/At$/.test(field)) {
      result[field] = parseEventDateText_(value, field);
    } else {
      result[field] = requireEventText_(value, field);
    }
  });

  if (Object.prototype.hasOwnProperty.call(result, 'status')) {
    validateEventChoice_(result.status, EVENT_STATUSES, 'status');
  }
  var start = result.applicationStartAt || source.applicationStartAt;
  var end = result.applicationEndAt || source.applicationEndAt;
  if (start && end && String(start) > String(end)) {
    throwEventError_('VALIDATION_FAILED', '모집 종료일은 모집 시작일보다 빠를 수 없습니다.');
  }
  return result;
}
