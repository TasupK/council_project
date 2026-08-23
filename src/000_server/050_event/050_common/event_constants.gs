/**
 * 행사복지관리 서비스 공통 상수와 허용값.
 * 화면과 서버 검증이 같은 유형 및 상태 계약을 사용하도록 한곳에서 관리한다.
 */

var EVENT_STATUSES = ['예정', '모집', '진행', '종료'];
var EVENT_CATEGORIES = ['개강총회', 'MT', '간식행사', '사물함', '축제', '기타'];
var EVENT_CATEGORY_CODES = {
  '개강총회': 'GC',
  'MT': 'MT',
  '간식행사': 'SN',
  '사물함': 'LK',
  '축제': 'FS',
  '기타': 'ET'
};
var EVENT_ATTENDANCE_STATUSES = ['출석', '미참석'];
var EVENT_DEFAULT_PAGE_SIZE = 10;
var EVENT_MAX_PAGE_SIZE = 100;
