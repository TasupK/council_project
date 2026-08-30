// 1. 로그인 컨텍스트 캐시 조회
function readCachedLoginContext_(email) {
  try {
    var value = CacheService.getScriptCache().get(buildLoginContextCacheKey_(email));
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Failed to read login context cache.', error);
    return null;
  }
}

// 2. 로그인 컨텍스트 캐시 저장
function writeLoginContextCache_(email, context) {
  try {
    CacheService.getScriptCache().put(
      buildLoginContextCacheKey_(email),
      JSON.stringify(context),
      LOGIN_CONTEXT_CACHE_SECONDS
    );
  } catch (error) {
    console.error('Failed to save login context cache.', error);
  }
}

// 3. 특정 사용자의 로그인 컨텍스트 캐시 삭제
function invalidateLoginContextCache_(email) {
  if (!email) return;
  try {
    CacheService.getScriptCache().remove(buildLoginContextCacheKey_(email));
  } catch (error) {
    console.error('Failed to invalidate login context cache.', error);
  }
}

// 4. 이메일 기반 캐시 키 생성
function buildLoginContextCacheKey_(email) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizeEmail_(email),
    Utilities.Charset.UTF_8
  );
  return LOGIN_CONTEXT_CACHE_PREFIX + Utilities.base64EncodeWebSafe(digest);
}
