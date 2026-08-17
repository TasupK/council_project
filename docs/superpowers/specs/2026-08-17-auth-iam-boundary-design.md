# Auth / IAM 경계 재설계

## 1. 목적

현재 `030_auth`와 `040_login`은 이름과 실제 책임이 어긋나 있다.

- 현재 `030_auth`: User / Role / Permission / Authorization
- 현재 `040_login`: Google Session / 로그인 Context / Cache / 로그인 API

이를 다음 경계로 재정의한다.

```text
030_auth = Authentication
040_iam  = Identity & Access Management / Authorization
```

이번 작업은 구조 리팩토링이며 로그인·권한 정책이나 외부 API 동작은 변경하지 않는다.

## 2. 책임 경계

### 2.1 Authentication — `030_auth`

질문은 하나다.

> 현재 요청자가 누구이며 유효한 로그인 상태인가?

소유 책임:

- Apps Script Session 사용자 식별
- 로그인 Context 생성
- 로그인 Context Cache
- 로그인 여부 검증
- 현재 사용자 facade API
- 현재 로그인 사용자의 권한 facade API

Auth는 User / Role / Permission 데이터를 소유하지 않고 IAM을 소비한다.

### 2.2 IAM — `040_iam`

질문은 다음이다.

> 이 사용자는 누구이며 어떤 Role과 Permission을 가지는가?

소유 책임:

- User
- Role
- Permission
- UserRole
- RolePermission
- 관리자 역할 판정
- 역할별 권한 계산
- 사용자 권한 병합
- Permission 기반 메뉴 계산
- 보호 API Authorization 검사

UserDB 테이블 소유권:

```text
users
roles
permissions
userRoles
rolePermissions
```

### 2.3 Settings — `070_settings`

Settings는 IAM 관리자 Application Layer다.

```text
조회:   Settings -> IAM -> UserDB
향후 수정: Settings -> IAM mutation service -> UserDB
```

Settings는 UserDB DAO를 갖지 않는다.

## 3. 목표 구조

```text
src/000_server/
├─ 030_auth/
│  ├─ auth_api.gs
│  ├─ auth_context.gs
│  ├─ auth_session.gs
│  └─ auth_cache.gs
│
├─ 040_iam/
│  ├─ 041_users/
│  │  ├─ users_query_service.gs
│  │  └─ users_sheet_dao.gs
│  ├─ 042_roles/
│  │  ├─ roles_query_service.gs
│  │  ├─ roles_sheet_dao.gs
│  │  └─ user_roles_sheet_dao.gs
│  └─ 043_permissions/
│     ├─ permissions_query_service.gs
│     ├─ permissions_access_service.gs
│     ├─ permissions_sheet_dao.gs
│     └─ role_permissions_sheet_dao.gs
│
├─ 050_event/
├─ 060_accounting/
└─ 070_settings/
```

`040_common`이나 빈 Service / Validator는 만들지 않는다.

## 4. Auth 함수 소유권

### `auth_api.gs`

```text
api_checkLogin
api_getCurrentUser
api_getMyPermissions
```

`api_getMyPermissions()`는 Permission 데이터를 반환하지만 "현재 로그인한 나"를 기준으로 하는 session-based facade이므로 Auth에 남는다.

### `auth_session.gs`

```text
getActiveUserEmailFromSession_
```

### `auth_cache.gs`

```text
getCachedLoginContext_
cacheLoginContext_
invalidateLoginContextCache_
buildLoginContextCacheKey_
```

### `auth_context.gs`

```text
getSessionUserContext_
buildSessionUserContextFromDb_
requireLoginContext_
```

`buildSessionUserContextFromDb_()`는 IAM을 orchestration해 다음 Context를 만든다.

```text
email
user
roles
permissions
isAdmin
dbMode
preview
```

Auth는 IAM 내부 계산 규칙을 복제하지 않는다.

## 5. IAM Users

### `041_users/users_sheet_dao.gs`

```text
listUserRows_
```

`users` Sheet의 물리 조회만 소유한다.

### `041_users/users_query_service.gs`

```text
findUserRowByEmail_
toUserDto_
```

Identity 검색과 User DTO 변환을 담당한다.

## 6. IAM Roles

### `042_roles/roles_sheet_dao.gs`

```text
listRoleRows_
```

### `042_roles/user_roles_sheet_dao.gs`

```text
listUserRoleRows_
```

### `042_roles/roles_query_service.gs`

```text
getRolesById_
getActiveRoleIdsByEmail_
toRoleDto_
summarizeRoleForUser_
isAdminRoleSet_
```

`isAdminRoleSet_()`는 `ADMIN_ROLE_ID`, protected role, 관리자 역할명 등을 해석하는 Role 규칙이므로 IAM이 소유한다.

## 7. IAM Permissions

### `043_permissions/permissions_sheet_dao.gs`

```text
listPermissionRows_
```

### `043_permissions/role_permissions_sheet_dao.gs`

```text
listRolePermissionRows_
```

### `043_permissions/permissions_query_service.gs`

```text
toPermissionDto_
getPermissionsById_
getPermissionIdsByRoleId_
actionToPermissionKey_
permissionScreenId_
buildPermissionTreeFromDb_
buildPermissionsByRoleFromDb_
buildUserPermissionsFromDb_
buildMenusFromPermissions_
```

`buildUserPermissionsFromDb_()`와 `buildMenusFromPermissions_()`는 현재 Login Context 생성 중 호출되지만 로그인 기술이 아니라 IAM 권한 해석 규칙이므로 IAM이 소유한다.

### `043_permissions/permissions_access_service.gs`

```text
requirePermission_
resolveRequiredPermissionScreenId_
throwPermissionError_
```

Authentication과 Authorization을 분리한다.

```text
Feature API
  -> apiHandler_
      -> requireLoginContext_   (030_auth)
      -> requirePermission_     (040_iam)
      -> Feature Service
```

## 8. 함수 이동 매핑

```text
040_login/login_api.gs
  api_checkLogin
  api_getCurrentUser
  api_getMyPermissions
    -> 030_auth/auth_api.gs

040_login/login_session.gs
  getActiveUserEmailFromSession_
    -> 030_auth/auth_session.gs

040_login/login_cache.gs
  getCachedLoginContext_
  cacheLoginContext_
  invalidateLoginContextCache_
  buildLoginContextCacheKey_
    -> 030_auth/auth_cache.gs

040_login/login_context.gs
  getSessionUserContext_
  buildSessionUserContextFromDb_
    -> 030_auth/auth_context.gs

  isAdminRoleSet_
    -> 040_iam/042_roles/roles_query_service.gs

  buildUserPermissionsFromDb_
  buildMenusFromPermissions_
    -> 040_iam/043_permissions/permissions_query_service.gs

030_auth/auth_context.gs
  requireLoginContext_
    -> 030_auth/auth_context.gs

030_auth/users.gs
  listUserRows_
    -> 040_iam/041_users/users_sheet_dao.gs
  findUserRowByEmail_
  toUserDto_
    -> 040_iam/041_users/users_query_service.gs

030_auth/roles.gs
  listRoleRows_
    -> 040_iam/042_roles/roles_sheet_dao.gs
  listUserRoleRows_
    -> 040_iam/042_roles/user_roles_sheet_dao.gs
  getRolesById_
  getActiveRoleIdsByEmail_
  toRoleDto_
  summarizeRoleForUser_
    -> 040_iam/042_roles/roles_query_service.gs

030_auth/permissions.gs
  listPermissionRows_
    -> 040_iam/043_permissions/permissions_sheet_dao.gs
  listRolePermissionRows_
    -> 040_iam/043_permissions/role_permissions_sheet_dao.gs
  toPermissionDto_
  getPermissionsById_
  getPermissionIdsByRoleId_
  actionToPermissionKey_
  permissionScreenId_
  buildPermissionTreeFromDb_
  buildPermissionsByRoleFromDb_
    -> 040_iam/043_permissions/permissions_query_service.gs
  requirePermission_
  resolveRequiredPermissionScreenId_
  throwPermissionError_
    -> 040_iam/043_permissions/permissions_access_service.gs
```

## 9. 의존 방향

허용:

```text
030_auth -> 040_iam
070_settings -> 030_auth
070_settings -> 040_iam
Feature APIs -> 030_auth
Feature APIs -> 040_iam
040_iam -> 020_schema
040_iam -> Core Sheet primitives
```

금지:

```text
040_iam -> 030_auth
040_iam -> 070_settings
030_auth -> 070_settings
020_schema -> 040_iam
```

GAS 전역 함수 모델 때문에 실행 가능하더라도 구조 검증에서 역의존을 금지한다.

## 10. 공용 Config 상수

현재 다음 상수는 `010_core/config.gs`에 있다.

```text
ADMIN_ROLE_ID
SETTINGS_PERMISSION_COLUMNS
LOGIN_CONTEXT_CACHE_PREFIX
LOGIN_CONTEXT_CACHE_SECONDS
```

소유 의미는 다음과 같다.

- `ADMIN_ROLE_ID`: IAM Role 규칙에서 사용
- `SETTINGS_PERMISSION_COLUMNS`: IAM Permission 계산과 Settings 화면 양쪽에서 사용
- `LOGIN_CONTEXT_CACHE_*`: Auth Cache에서 사용

이번 구조 리팩토링에서는 상수의 값과 이름을 변경하거나 별도 파일로 이동하지 않는다. 특히 `SETTINGS_PERMISSION_COLUMNS`는 이름이 Settings 중심이지만 현재 런타임 IAM 계산에서도 사용하므로 **호환성을 위해 그대로 유지**한다. 상수 재명명은 별도 cleanup 작업으로 분리한다.

## 11. Settings 설계와의 관계

기존 표현인 "Auth/IAM이 UserDB를 소유한다"를 다음처럼 정밀화한다.

```text
IAM이 User / Role / Permission 데이터를 소유한다.
Auth는 IAM을 소비해 로그인 Context를 만든다.
Settings는 IAM을 소비해 관리자 UI 데이터를 만든다.
```

현재 Settings의 다음 함수는 계속 IAM read function을 사용한다.

```text
listUsersForSettings_
listRolesForSettings_
getSettingsPermissionsData_
```

## 12. Schema / Integrity

다음은 이동하지 않는다.

```text
020_schema/user_db_schema.gs
020_schema/user_db_integrity.gs
```

IAM이 UserDB schema를 읽는 것은 허용한다. Auth의 `buildSessionUserContextFromDb_()`가 로그인 사용자 무결성 검사를 호출하는 현재 동작도 유지한다.

## 13. 동작 보존

다음 public/internal contract를 유지한다.

```text
api_checkLogin
api_getCurrentUser
api_getMyPermissions
requireLoginContext_
requirePermission_
```

또한 다음을 변경하지 않는다.

- Google Session 기반 사용자 식별
- 로그인 Cache 동작과 TTL
- LockService 동시성 제어
- NOT_REGISTERED / INACTIVE / NO_ROLE / LOGIN_DB_INTEGRITY_ERROR 처리
- 관리자 판정 규칙
- Permission action key 매핑
- Permission tree / role permission matrix 구조
- 로그인 Context shape
- Settings public API / frontend 계약
- UserDB schema
- 기존 상수 값과 이름

Mutation API는 새로 구현하지 않는다.

## 14. 테스트 / 구조 검증

행동 회귀 테스트 최소 범위:

- Session 이메일 조회
- Context cache hit / miss
- 미등록 사용자
- 비활성 사용자
- Role 없는 사용자
- 정상 Context 구성
- 관리자 Role 판정
- Role Permission 병합
- 메뉴 계산
- `requireLoginContext_()` 성공/실패
- `requirePermission_()` admin bypass / grant / deny
- `api_checkLogin`
- `api_getCurrentUser`
- `api_getMyPermissions`

구조 검증 최소 범위:

- legacy `040_login` 제거
- `030_auth`에서 User/Role/Permission DAO 제거
- `040_iam` 목표 파일 존재
- 함수 단일 소유권
- IAM -> Auth / Settings 역의존 금지
- Auth -> Settings 역의존 금지
- 각 DAO의 자기 테이블 전용 접근
- Query Service Sheet write 금지
- 중복 함수 정의 금지
- 빈 placeholder 금지

## 15. 완료 기준

1. `030_auth`는 Authentication만 소유한다.
2. `040_iam`은 Identity / Role / Permission / Authorization을 소유한다.
3. legacy `040_login`은 제거된다.
4. Auth -> IAM 의존만 존재하고 IAM -> Auth 의존은 없다.
5. Settings는 IAM 관리자 Application Layer로 유지된다.
6. UserDB 테이블 소유권은 IAM으로 명확해진다.
7. 기존 로그인/권한 API와 동작이 유지된다.
8. 회귀 테스트와 구조 검증이 통과한다.
9. Event / Accounting / Settings frontend 동작을 변경하지 않는다.
