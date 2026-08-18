// Event 도메인 mutation에서 현재 IAM 유효 권한을 검사한다.

function requireEventEditContext_(context) {
  if (!context || !context.ok) throwPermissionError_('로그인 컨텍스트가 없습니다.');
  if (context.isAdmin) return true;

  var details = buildEffectivePermissionDetails_(context.permissions || {});
  var aliases = ['event', '행사', '복지'];
  var allowed = details.some(function (detail) {
    if (!detail || !detail.grants || !detail.grants.edit) return false;
    var token = normalizeAccessToken_([detail.area, detail.name].join(' '));
    return aliases.some(function (alias) {
      return token.indexOf(normalizeAccessToken_(alias)) !== -1;
    });
  });
  if (allowed) return true;
  throwPermissionError_('행사 수정 권한이 없습니다.');
}
