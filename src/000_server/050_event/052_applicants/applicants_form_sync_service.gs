// Google Forms 응답을 행사 신청/추가답변 테이블로 명시적으로 동기화한다.

function syncApplicantsFromFormsData_(request, current) {
  var eventId = requireEventRequestId_(request);
  var event = findEventRowById_(eventId);
  if (!event) throwEventError_('NOT_FOUND', '행사를 찾을 수 없습니다.');

  var existingForm = findEventFormByEventId_(eventId);
  var payload = request && request.payload && typeof request.payload === 'object' ? request.payload : {};
  var googleFormId = Object.prototype.hasOwnProperty.call(payload, 'googleFormId')
    ? payload.googleFormId
    : existingForm && existingForm.googleFormId;
  var responseSheetId = Object.prototype.hasOwnProperty.call(payload, 'responseSheetId')
    ? payload.responseSheetId
    : existingForm && existingForm.responseSheetId;

  // 외부 Google 데이터 읽기는 OperationDB write lock 밖에서 수행한다.
  var source = resolveEventFormResponseSource_(googleFormId, responseSheetId);
  var candidates = buildEventFormCandidates_(source, event);

  return withOperationWriteLock_(function () {
    var existingIds = {};
    findAllEventApplicationSourceResponseIds_().forEach(function (id) {
      existingIds[String(id)] = true;
    });
    var seenBatch = {};
    var imported = [];
    var duplicateCount = 0;

    (candidates.items || []).forEach(function (candidate) {
      var responseId = String(candidate.applicant && candidate.applicant.sourceResponseId || '');
      if (!responseId || existingIds[responseId] || seenBatch[responseId]) {
        duplicateCount += 1;
        return;
      }
      seenBatch[responseId] = true;
      existingIds[responseId] = true;
      imported.push(candidate);
    });

    imported.forEach(function (candidate) {
      insertEventApplicationRow_(candidate.applicant);
      (candidate.extraAnswers || []).forEach(function (answer) {
        insertEventExtraAnswerRow_(answer);
      });
    });

    var syncedAt = getCurrentIsoDateTime_();
    var formPatch = {
      eventId: eventId,
      googleFormId: source.googleFormId || '',
      responseSheetId: source.responseSheetId || '',
      status: '연동',
      lastSyncedAt: syncedAt
    };
    if (existingForm) {
      updateEventFormRowById_(existingForm.id, formPatch);
    } else {
      formPatch.id = Utilities.getUuid();
      formPatch.createdAt = syncedAt;
      insertEventFormRow_(formPatch);
    }

    return {
      importedCount: imported.length,
      duplicateCount: duplicateCount,
      invalidCount: (candidates.invalidRows || []).length,
      invalidRows: candidates.invalidRows || [],
      sourceSheetName: source.sheetName || '',
      formSync: {
        configured: true,
        googleFormId: source.googleFormId || '',
        responseSheetId: source.responseSheetId || '',
        status: '연동',
        lastSyncedAt: syncedAt
      }
    };
  });
}
