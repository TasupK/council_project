// 설정된 Student Fee Google Form의 응답을 읽기 전용으로 조회한다.

function readStudentFeeFormResponses_(googleFormId) {
  var formId = String(googleFormId || '').trim();
  if (!formId) throw new Error('학생회비GoogleFormID 값이 필요합니다.');

  var form;
  try {
    form = FormApp.openById(formId);
  } catch (error) {
    throw new Error('학생회비 Google Form을 열 수 없습니다. Form ID와 접근 권한을 확인해주세요.');
  }

  try {
    return form.getResponses();
  } catch (error) {
    throw new Error('학생회비 Google Form 응답을 읽을 수 없습니다.');
  }
}
