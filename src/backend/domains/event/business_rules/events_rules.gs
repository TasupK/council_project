function buildEventPayload_(payload, requireAll) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var fields = [
    'name', 'category', 'status',
    'applicationEnabled', 'feeEnabled', 'attendanceEnabled', 'balanceDistributionEnabled',
    'applicationStartAt', 'applicationEndAt', 'eventStartAt', 'eventEndAt',
    'capacity', 'payerFee', 'nonPayerFee', 'description', 'evidenceFolderId',
    'department', 'location', 'note'
  ];
  var optionalTextFields = ['evidenceFolderId', 'department', 'location', 'note'];
  var booleanFields = ['applicationEnabled', 'feeEnabled', 'attendanceEnabled', 'balanceDistributionEnabled'];
  var result = {};

  fields.forEach(function (field) {
    if (!requireAll && !Object.prototype.hasOwnProperty.call(source, field)) return;
    var value = source[field];
    if (optionalTextFields.indexOf(field) >= 0) {
      result[field] = normalizeEventText_(value);
      return;
    }
    if (booleanFields.indexOf(field) >= 0) {
      result[field] = parseEventBoolean_(value, field);
    } else if ((field === 'payerFee' || field === 'nonPayerFee') && result.feeEnabled === false) {
      result[field] = 0;
    } else if (field === 'capacity' || field === 'payerFee' || field === 'nonPayerFee') {
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
  if (Object.prototype.hasOwnProperty.call(result, 'category')) {
    validateEventChoice_(result.category, EVENT_CATEGORIES, 'category', 'VALIDATION_FAILED');
  }
  var start = result.applicationStartAt || source.applicationStartAt;
  var end = result.applicationEndAt || source.applicationEndAt;
  if (start && end && String(start) > String(end)) {
    throwEventError_('VALIDATION_FAILED', '모집 종료일은 모집 시작일보다 빠를 수 없습니다.');
  }
  var eventStart = result.eventStartAt || source.eventStartAt;
  var eventEnd = result.eventEndAt || source.eventEndAt;
  if (eventStart && eventEnd && String(eventStart) > String(eventEnd)) {
    throwEventError_('VALIDATION_FAILED', '행사 종료일은 행사 시작일보다 빠를 수 없습니다.');
  }
  if (result.feeEnabled === false) {
    result.payerFee = 0;
    result.nonPayerFee = 0;
  }
  return result;
}
