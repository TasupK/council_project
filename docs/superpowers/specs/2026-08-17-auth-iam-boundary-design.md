# Auth / IAM 경계 재설계

## 1. 목적

현재 서버의 `030_auth`와 `040_login`은 파일명과 실제 책임이 어긋나 있다.

- `030_auth`는 실제로 User / Role / Permission / Authorization 로직을 소유한다.
- `040_login`은 실제로 Google Session, 로그인 컨텍스트, 로그인 캐시, 로그인 API를 소유한다.

이번 리팩토링에서는 이 경계를 다음처럼 재정의한다.

```text
030_auth = Authentication
040_iam  = Identity & Access Management / Authorization
```

목표는 기능 변경 없이 책임과 의존 방향을 명확히 만드는 것이다.

## 2. 핵심 원칙

### 2.1 Authentication

`030_auth`의 책임은 "현재 요청자가 누구이며 유효한 로그인 상태인가"를 판단하고 로그인 컨텍스트를 제공하는 것이다.

소유 책임:

- Apps Script Session에서 현재 사용자 식별
- 로그인 컨텍스트 생성
- 로그인 컨텍스트 캐시
- 로그인 여부 검증
- 현재 사용자/내 권한 facade API

Auth는 User / Role / Permission 데이터를 직접 소유하지 않는다. 필요한 Identity / Role / Permission 정보는 IAM을 통해 읽는다.

### 2.2 IAM

`040_iam`의 책임은 Identity와 Access Control 데이터 및 규칙을 소유하는 것이다.

소유 책임:

- User
- Role
- Permission
- UserRole
- RolePermission
- 관리자 역할 판정
- 역할별 권한 계산
- 사용자 권한 병합
- 권한 기반 메뉴 모델 계산
- 보호 API의 Authorization 검사

UserDB의 다음 테이블은 IAM 소유다.

```text
users
roles
permissions
userRoles
rolePermissions
```

### 2.3 Settings

`070_settings`는 IAM 관리용 관리자 Application Layer다.

Settings는 IAM 데이터를 직접 소유하거나 UserDB를 직접 CRUD하지 않는다.

현재 조회 흐름:

```text
Settings -> IAM -> UserDB
```

향후 mutation 흐름:

```text
Settings -> IAM mutation service -> UserDB
```

## 3. 목표 디렉터리 구조

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
│  │
│  ├─ 042_roles/
│  │  ├─ roles_query_service.gs
│  │  ├─ roles_sheet_dao.gs
│  │  └─ user_roles_sheet_dao.gs
│  │
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

현재 단계에서는 `040_common`이나 빈 Service / Validator 파일을 만들지 않는다.

## 4. Auth 함수 소유권

### 4.1 auth_api.gs

현재 `040_login/login_api.gs`의 public API를 그대로 이동한다.

```text
api_checkLogin
api_getCurrentUser
api_getMyPermissions
```

`api_getMyPermissions()`는 권한 데이터를 반환하지만 "현재 로그인한 사용자의 권한"을 조회하는 session-based facade이므로 Auth가 소유한다.

IAM은 Auth를 호출하지 않는다.

### 4.2 auth_session.gs

```text
getActiveUserEmailFromSession_
```

Apps Script Session에서 현재 Google 계정 이메일을 읽는 책임만 가진다.

### 4.3 auth_cache.gs

```text
getCachedLoginContext_
cacheLoginContext_
invalidateLoginContextCache_
buildLoginContextCacheKey_
```

캐시 대상이 IAM 데이터가 아니라 로그인 컨텍스트이므로 Auth가 소유한다.

### 4.4 auth_context.gs

```text
getSessionUserContext_
buildSessionUserContextFromDb_
requireLoginContext_
```

`buildSessionUserContextFromDb_()`는 IAM을 orchestration해서 다음 컨텍스트를 만든다.

```text
email
user
roles
permissions
isAdmin
dbMode
preview
```

Auth는 IAM 내부 계산을 재구현하지 않는다.

## 5. IAM Users

### 5.1 users_sheet_dao.gs

```text
listUserRows_
```

`users` 테이블의 물리 Sheet 조회만 소유한다.

### 5.2 users_query_service.gs

```text
findUserRowByEmail_
toUserDto_
```

User identity 검색과 API/Context용 User DTO 변환을 담당한다.

## 6. IAM Roles

### 6.1 roles_sheet_dao.gs

```text
listRoleRows_
```

`roles` 테이블만 읽는다.

### 6.2 user_roles_sheet_dao.gs

```text
listUserRoleRows_
```

`userRoles` 관계 테이블만 읽는다.

### 6.3 roles_query_service.gs

```text
getRolesById_
getActiveRoleIdsByEmail_
toRoleDto_
summarizeRoleForUser_
isAdminRoleSet_
```

`isAdminRoleSet_()`는 `ADMIN_ROLE_ID`, protected role, 관리자 역할명 등 Role 의미를 해석하는 IAM 규칙이므로 Auth가 아니라 IAM Roles가 소유한다.

## 7. IAM Permissions

### 7.1 permissions_sheet_dao.gs

```text
listPermissionRows_
```

`permissions` 테이블만 읽는다.

### 7.2 role_permissions_sheet_dao.gs

```text
listRolePermissionRows_
```

`rolePermissions` 관계 테이블만 읽는다.

### 7.3 permissions_query_service.gs

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

이 파일은 Permission 데이터를 읽어 런타임 권한 모델을 계산한다.

`buildUserPermissionsFromDb_()`와 `buildMenusFromPermissions_()`는 현재 Login Context에서 사용되지만 로그인 기술 자체가 아니라 IAM 권한 해석 규칙이므로 IAM에 위치한다.

### 7.4 permissions_access_service.gs

```text
requirePermission_
resolveRequiredPermissionScreenId_
throwPermissionError_
```

Authentication과 분리된 Authorization 경계다.

보호 API 흐름은 다음과 같다.

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
040_iam -> 020_schema / Core Sheet primitives
```

금지:

```text
040_iam -> 030_auth
040_iam -> 070_settings
030_auth -> 070_settings
020_schema -> 040_iam
```

Google Apps Script 전역 함수 모델 때문에 런타임상 호출이 가능하더라도 구조 검증에서 위 역의존을 금지한다.

## 10. Settings 설계와의 관계

기존 Settings 설계에서 사용한 "Auth/IAM이 UserDB를 소유한다"는 표현을 다음처럼 정밀화한다.

```text
IAM이 User / Role / Permission 데이터를 소유한다.
Auth는 IAM을 소비해 로그인 Context를 만든다.
Settings는 IAM을 소비해 관리자 UI 데이터를 만든다.
```

따라서 현재 Settings Query Services의 다음 함수들은 계속 IAM read function을 호출한다.

```text
listUsersForSettings_
listRolesForSettings_
getSettingsPermissionsData_
```

Settings에 UserDB DAO를 추가하지 않는다.

## 11. 스키마와 무결성 검사

`020_schema/user_db_schema.gs`와 UserDB integrity 로직은 이번 리팩토링에서 이동하지 않는다.

IAM이 스키마 정의를 읽는 것은 허용한다.

`buildSessionUserContextFromDb_()`가 로그인 사용자 무결성 검사를 호출하는 현재 동작도 유지한다. 이번 작업은 ownership/file boundary 리팩토링이며 무결성 정책 변경 작업이 아니다.

## 12. 동작 보존

다음 public contract와 동작을 변경하지 않는다.

```text
api_checkLogin
api_getCurrentUser
api_getMyPermissions
requireLoginContext_
requirePermission_
```

또한 다음을 그대로 유지한다.

- Google Session 기반 사용자 식별
- 로그인 캐시 동작과 TTL
- LockService 기반 로그인 컨텍스트 생성 동시성 제어
- NOT_REGISTERED / INACTIVE / NO_ROLE / LOGIN_DB_INTEGRITY_ERROR 처리
- 관리자 역할 판정 규칙
- 권한 key 매핑 규칙
- permission tree / role permission matrix 구조
- 로그인 context shape
- Settings public API 및 frontend 계약
- UserDB 스키마

이번 리팩토링에서는 mutation API를 새로 구현하지 않는다.

## 13. 테스트 및 구조 검증

리팩토링 전에 현재 Auth/IAM/Login 동작을 고정하는 회귀 테스트를 추가하거나 확장한다.

최소 검증 대상:

- Google Session 이메일 조회 결과 처리
- 로그인 컨텍스트 cache hit / cache miss
- 등록되지 않은 사용자
- 비활성 사용자
- 역할이 없는 사용자
- 정상 사용자 context 구성
- 관리자 역할 판정
- 역할별 permission 병합
- 메뉴 계산
- `requireLoginContext_()` 성공/실패
- `requirePermission_()` admin bypass / grant / deny
- `api_checkLogin`
- `api_getCurrentUser`
- `api_getMyPermissions`

구조 검증기는 다음을 확인한다.

- legacy `040_login` 제거
- `030_auth`에 User/Role/Permission Sheet DAO가 남지 않음
- `040_iam` 목표 파일 존재
- 함수 단일 소유권
- IAM -> Auth / Settings 역의존 금지
- Auth -> Settings 역의존 금지
- DAO는 자신의 테이블만 직접 읽음
- Query Service에서 Sheet write 금지
- 중복 함수 정의 금지
- 빈 placeholder 파일 금지

## 14. 완료 기준

1. `030_auth`는 Authentication만 소유한다.
2. `040_iam`은 Identity / Role / Permission / Authorization을 소유한다.
3. `040_login` legacy 디렉터리는 제거된다.
4. Auth -> IAM 의존만 존재하고 IAM -> Auth 의존은 없다.
5. Settings는 IAM 관리 Application Layer로 유지된다.
6. UserDB 테이블 소유권은 IAM으로 명확해진다.
7. 기존 public API와 로그인/권한 동작이 유지된다.
8. 회귀 테스트와 구조 검증이 통과한다.
9. Event, Accounting, Settings frontend 동작을 변경하지 않는다.
