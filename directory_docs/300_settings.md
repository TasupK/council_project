# settings frontend

사용자, 역할, 권한 등 시스템 운영 설정 페이지 영역이다.

## 구성

설정 라우트는 `src/frontend/pages/settings_*`, 조작 로직은 `features/settings_*`, IAM API는 `entities/iam`, 공통 shell은 `widgets/settings_shell`에 둔다.

## 역할

- UserDB 기반 사용자 정보 조회와 관리
- 역할과 권한 매트릭스 관리
- 설정 영역에서만 쓰는 공통 client helper 제공

## 규칙

- 설정 shell과 스타일은 `widgets/settings_shell`에 둔다.
- 사용자/역할/권한 각각의 조작 로직은 해당 feature에 둔다.
- 관리자 여부는 클라이언트 표시용으로만 사용하고, 서버 API에서 다시 확인한다.
- UserDB 탭 이름과 필드 이름은 `user_db_schema.gs`를 기준으로 한다.
