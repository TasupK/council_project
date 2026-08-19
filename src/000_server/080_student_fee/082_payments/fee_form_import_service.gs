function syncStudentFeeFormApplicationsData_(request, context) {
  var settings = getStudentFeeFormSettings_();
  if (!settings.enabled) throw new Error('학생회비 Form 연동이 비활성 상태입니다.');
  if (!String(settings.googleFormId || '').trim()) throw new Error('학생회비 Google Form ID 설정이 필요합니다.');
  if (!String(settings.currentSemesterId || '').trim()) throw new Error('학생회비 현재학기ID 설정이 필요합니다.');

  assertValidStudentFeeSemester_(settings.currentSemesterId);

  var actorEmail = String(context && context.email || '').trim();
  var responses = readStudentFeeFormResponses_(settings.googleFormId);

  return withOperationWriteLock_(function () {
    var imported = [];
    var duplicates = [];

    for (var i = 0; i < responses.length; i += 1) {
      var dto = mapStudentFeeFormResponse_(responses[i]);
      var sourceResponseId = String(dto && dto.sourceResponseId || '').trim();
      if (!sourceResponseId) throw new Error('Student Fee Form 원본응답ID가 비어 있습니다.');

      var existing = findFeeApplicationRowBySourceResponseId_(sourceResponseId);
      if (existing) {
        duplicates.push(sourceResponseId);
        continue;
      }

      var coverage = calculateStudentFeeCoverage_({
        currentSemesterId: settings.currentSemesterId,
        academicYearLevel: dto.academicYearLevel,
        semesterWithinYear: dto.semesterWithinYear,
        coverageMode: dto.coverageMode
      });
      var importedAt = getCurrentIsoDateTime_();
      var application = {
        id: Utilities.getUuid(),
        sourceResponseId: sourceResponseId,
        sourceResponseAt: dto.sourceResponseAt,
        importedAt: importedAt,
        studentId: dto.studentId,
        name: dto.name,
        affiliation: dto.affiliation,
        paymentDate: dto.paymentDate,
        startSemesterId: coverage.startSemesterId,
        semesterCount: coverage.semesterCount,
        appliedAt: dto.sourceResponseAt,
        status: '접수',
        managerEmail: '',
        processedAt: '',
        studentCardFileId: dto.studentCardFileId || '',
        depositFileId: dto.depositFileId || ''
      };

      insertFeeApplicationRow_(application);
      writeStudentFeeAudit_(
        actorEmail,
        'IMPORT',
        'feeApplications',
        application.id,
        null,
        application,
        'Student Fee Google Form 응답 가져오기'
      );
      imported.push(application);
    }

    var syncedAt = getCurrentIsoDateTime_();
    updateStudentFeeFormLastSyncedAt_(syncedAt);
    return {
      importedCount: imported.length,
      duplicateCount: duplicates.length,
      imported: imported,
      duplicateSourceResponseIds: duplicates,
      lastSyncedAt: syncedAt
    };
  });
}
