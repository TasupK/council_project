# Settings 관리자 Application Layer 설계

## 1. 목적

`src/000_server/settings.gs`와 `src/000_server/030_auth`에 섞여 있는 관리자 화면 책임을 분리한다.

이번 작업의 목표는 Settings를 새로운 데이터 소유 도메인으로 만드는 것이 아니다. 사용자, 역할, 권한과 그 관계는 계속 Auth/IAM이 소유하고, Settings는 관리자 화면을 위한 조회 및 관리 요청을 조합하는 Application Layer로 정의한다.

현재 범위는 다음과 같다.

- Settings Home의 시스템 상태 조회
- 사용자 관리 조회
- 역할 관리 조회
- 권한 관리 조회
- 관리자 접근 제어

현재 프론트에 남아 있는 사용자/역할/권한 저장 TODO는 이번 구조 리팩토링에서 구현하지 않는다.

향후 학년도, 시스템명, DB/Drive 설정, 외부 연동 등 실제 시스템 설정 기능이 추가되더라도 기존 사용자/역할/권한 구조를 다시 이동하지 않고 `070_settings` 아래 새 feature를 추가할 수 있도록 확장 가능한 경계를 만든다.

## 2. 핵심 경계

### 2.1 Auth / IAM

`030_auth`는 인증과 인가의 실제 런타임 경계이며 UserDB 접근제어 데이터의 소유자다.

소유 책임:

- 로그인 사용자 식별
- 로그인 컨텍스트 검증
- 사용자 원본 조회
- 역할 원본 조회
- 권한 원본 조회
- 사용자-역할 관계
- 역할-권한 관계
- 런타임 API 권한 검사

다음과 같은 함수는 Auth/IAM에 남는다.

```text
requireLoginContext_
findUserRowByEmail_
listUserRows_
listRoleRows_
listUserRoleRows_
getRolesById_
getActiveRoleIdsByEmail_
listPermissionRows_
listRolePermissionRows_
getPermissionsById_
getPermissionIdsByRoleId_
permissionScreenId_
requirePermission_
resolveRequiredPermissionScreenId_
throwPermissionError_
```

`permissionScreenId_`는 런타임 `resolveRequiredPermissionScreenId_()`가 직접 사용하므로 Auth/IAM이 계속 소유한다.

DTO/primitive helper 중 로그인 컨텍스트나 Auth 내부에서도 실제로 사용하는 함수는 Auth/IAM에 유지한다.

### 2.2 Settings

`070_settings`는 관리자 화면을 위한 Application Layer다.

소유 책임:

- 시스템 관리자 접근 확인
- Settings 공통 shell 데이터 구성
- 사용자 관리 화면 조회 모델 구성
- 역할 관리 화면 조회 모델 구성
- 권한 관리 화면 조회 모델 구성
- 향후 관리자 변경 요청 orchestration

Settings는 UserDB 테이블을 직접 소유하지 않는다.

향후 Settings에서 사용자, 역할, 권한을 수정하는 기능이 생기면 Settings Service가 직접 Sheet CRUD를 하지 않고 Auth/IAM의 mutation service를 호출한다.

```text
Settings API
  -> Settings Service
      -> Auth/IAM Service
          -> UserDB
```

## 3. 데이터 소유권

UserDB 테이블과 소유권은 변경하지 않는다.

```text
users             -> Auth/IAM
roles             -> Auth/IAM
permissions       -> Auth/IAM
userRoles         -> Auth/IAM
rolePermissions   -> Auth/IAM
```

Settings에는 위 테이블의 별도 DAO를 만들지 않는다.

Settings 전용 시스템 설정 테이블은 현재 존재하지 않는다. 향후 실제 시스템 설정을 저장하게 될 때 해당 feature가 자신의 DAO를 추가한다.

## 4. 목표 디렉터리 구조

현재 구현할 실제 파일 구조는 다음을 목표로 한다.

```text
src/000_server/070_settings/
├─ 070_common/
│  ├─ settings_access.gs
│  └─ settings_shell_query_service.gs
│
├─ 071_users/
│  ├─ settings_users_api.gs
│  └─ settings_users_query_service.gs
│
├─ 072_roles/
│  ├─ settings_roles_api.gs
│  └─ settings_roles_query_service.gs
│
└─ 073_permissions/
   ├─ settings_permissions_api.gs
   └─ settings_permissions_query_service.gs
```

현재 mutation 기능이 없으므로 다음 파일은 억지로 만들지 않는다.

- `*_service.gs`
- `*_validator.gs`
- `*_sheet_dao.gs`

향후 실제 기능이 생길 때만 추가한다.

확장 예시는 다음과 같다.

```text
070_settings/
├─ 074_system/
├─ 075_database/
├─ 076_integrations/
└─ ...
```

예를 들어 실제 시스템 설정값을 저장하게 되면:

```text
074_system/
├─ system_settings_api.gs
├─ system_settings_service.gs
├─ system_settings_query_service.gs
├─ system_settings_validator.gs
└─ system_settings_sheet_dao.gs
```

처럼 독립 feature로 추가할 수 있다.

## 5. Common 책임

### 5.1 settings_access.gs

Settings 화면 공통 관리자 접근 검증만 담당한다.

현재 `settings.gs`의 다음 함수가 대상이다.

```text
getAdminSettingsCurrent_
```

이 함수의 현재 동작은 유지한다.

- `api_getCurrentUser()` 호출
- 비로그인/실패 응답 전달
- `isAdmin`이 아니면 `FORBIDDEN`

이번 리팩토링에서 인증 정책 자체는 변경하지 않는다.

### 5.2 settings_shell_query_service.gs

각 Settings 화면이 공유하는 shell 데이터를 구성한다.

현재 `settings.gs`의 다음 함수가 대상이다.

```text
buildSettingsBaseData_
loadSettingsHomeData
```

현재 반환 계약은 유지한다.

- app name/version/term/baseDate/syncStatus
- database 연결 정보
- session 정보
- currentUser

`v0.7`, `2026학년도` 등 현재 하드코딩 값은 구조 리팩토링 중 변경하지 않는다.

향후 실제 시스템 설정 feature가 생기면 이 Query Service가 해당 feature의 조회 결과를 사용할 수 있다.

## 6. 071_users

### 6.1 Settings Users API

현재 공개 함수:

```text
loadSettingsUsersData
```

외부 함수명과 반환 형태는 유지한다.

API는 관리자 접근 확인과 Query Service 연결만 담당한다.

### 6.2 Settings Users Query Service

현재 `030_auth/users.gs`의 Settings 전용 조합 책임을 이동한다.

```text
listUsersForSettings_
```

사용자 화면 조회 모델은 Auth/IAM이 제공하는 사용자, 역할, 사용자-역할 데이터를 읽어 구성한다.

현재 사용자 DTO 계약은 유지한다.

```text
id
name
email
studentId
phone
department
roleIds
roles
status
updatedAt
updatedBy
```

현재 `department`가 빈 문자열인 동작도 변경하지 않는다.

향후 `saveUserChanges`가 구현되면 `settings_users_service.gs`를 추가하되 UserDB를 직접 수정하지 않는다.

## 7. 072_roles

### 7.1 Settings Roles API

현재 공개 함수:

```text
loadSettingsRolesData
```

외부 계약을 유지한다.

### 7.2 Settings Roles Query Service

현재 `030_auth/roles.gs`의 Settings 전용 조합 책임을 이동한다.

```text
listRolesForSettings_
```

역할 목록과 활성 사용자 배정 수를 조합해 관리자 화면 모델을 만든다.

Auth 런타임에서 사용하는 다음 로직은 `030_auth`에 남는다.

```text
getRolesById_
getActiveRoleIdsByEmail_
summarizeRoleForUser_
```

향후 `saveRoleChanges`가 구현되면 Settings Service가 Auth/IAM의 역할 mutation 경계를 호출한다.

## 8. 073_permissions

### 8.1 Settings Permissions API

현재 공개 함수:

```text
loadSettingsPermissionsData
```

외부 계약을 유지한다.

### 8.2 Settings Permissions Query Service

현재 `030_auth/permissions.gs`의 관리자 화면 전용 조회 모델을 이동한다.

```text
actionToPermissionKey_
buildPermissionTreeFromDb_
buildPermissionsByRoleFromDb_
```

`actionToPermissionKey_`는 현재 관리자 화면의 트리/매트릭스 생성에서만 사용하므로 Settings Permissions Query Service가 소유한다.

이 Query Service는 권한 정의와 역할-권한 관계를 읽어 화면용 트리 및 매트릭스를 만든다.

현재 반환 데이터 구조와 `SETTINGS_PERMISSION_COLUMNS` 사용은 유지한다.

런타임 인가 책임은 Settings로 이동하지 않는다.

다음 함수들은 반드시 Auth에 남는다.

```text
permissionScreenId_
requirePermission_
resolveRequiredPermissionScreenId_
throwPermissionError_
```

Settings Permissions Query Service는 화면 node ID가 필요할 때 Auth/IAM의 `permissionScreenId_()`를 읽기 전용 helper로 사용한다. 동일 helper를 복제하지 않는다.

## 9. 의존 방향

현재 조회 흐름:

```text
Settings Public API
  -> Settings Access
  -> Feature Query Service
      -> Auth/IAM read functions
          -> UserDB
```

향후 mutation 흐름:

```text
Settings Public API
  -> Settings Access
  -> Settings Feature Service
      -> Auth/IAM mutation service
          -> UserDB
```

금지:

```text
Settings -> UserDB 직접 Sheet CRUD
Auth Runtime -> Settings Query Service 의존
Settings가 requirePermission_ 구현 소유
Auth와 Settings에 동일 DTO/helper 복제
```

의존은 기본적으로 Settings -> Auth/IAM 방향이다.

## 10. 현재 함수 이동 요약

```text
src/000_server/settings.gs
  getAdminSettingsCurrent_
    -> 070_settings/070_common/settings_access.gs

  buildSettingsBaseData_
  loadSettingsHomeData
    -> 070_settings/070_common/settings_shell_query_service.gs

  loadSettingsUsersData
    -> 070_settings/071_users/settings_users_api.gs

  loadSettingsRolesData
    -> 070_settings/072_roles/settings_roles_api.gs

  loadSettingsPermissionsData
    -> 070_settings/073_permissions/settings_permissions_api.gs

src/000_server/030_auth/users.gs
  listUsersForSettings_
    -> 070_settings/071_users/settings_users_query_service.gs

src/000_server/030_auth/roles.gs
  listRolesForSettings_
    -> 070_settings/072_roles/settings_roles_query_service.gs

src/000_server/030_auth/permissions.gs
  actionToPermissionKey_
  buildPermissionTreeFromDb_
  buildPermissionsByRoleFromDb_
    -> 070_settings/073_permissions/settings_permissions_query_service.gs
```

나머지 Auth/IAM 원본 조회와 런타임 인증/인가 함수는 `030_auth`에 유지한다. 특히 `permissionScreenId_()`는 Auth 런타임 함수의 의존성이므로 이동하지 않는다.

## 11. 외부 동작 보존

구조 리팩토링 중 다음 항목을 변경하지 않는다.

- `loadSettingsHomeData`
- `loadSettingsUsersData`
- `loadSettingsRolesData`
- `loadSettingsPermissionsData`
- 현재 응답 형태
- 관리자 판정 방식
- 현재 `FORBIDDEN` 응답
- Settings 프론트 HTML/JavaScript
- 사용자/역할/권한 저장 TODO
- UserDB 스키마
- 런타임 로그인/권한 정책

기능상 개선이나 미구현 저장 기능은 별도 후속 작업으로 처리한다.

## 12. 테스트 및 구조 검증

리팩토링 전에 Settings 행동 특성화 테스트를 추가한다.

최소 고정 대상:

- 관리자/비관리자 Settings 접근
- Settings Home 반환 구조
- 사용자 목록 + 역할 조합
- 역할 assignedCount 계산
- 권한 트리 생성
- 역할별 권한 매트릭스 생성

구조 검증기는 다음을 확인한다.

- 루트 `src/000_server/settings.gs` 제거
- `070_settings` 목표 파일 존재
- Settings 전용 함수 소유권
- `030_auth`의 런타임 함수 유지
- Settings 코드에서 UserDB 직접 write 금지
- Query Service의 write/lock 금지
- 중복 함수 정의 금지
- 빈 placeholder 파일 금지

## 13. 완료 기준

리팩토링 완료 조건은 다음과 같다.

1. 외부 Settings API 함수명과 반환 계약이 유지된다.
2. `030_auth`에는 인증/인가와 IAM 데이터 소유 책임만 남는다.
3. Settings 화면 전용 조회 조합은 `070_settings`로 이동한다.
4. Settings는 UserDB를 직접 소유하지 않는다.
5. 향후 시스템 설정 feature를 `074+`로 추가할 수 있다.
6. 회귀 테스트와 구조 검증이 통과한다.
7. 프론트와 DB 스키마는 변경하지 않는다.
