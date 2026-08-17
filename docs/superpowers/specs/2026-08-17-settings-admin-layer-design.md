# Settings 관리자 Application Layer 설계

## 1. 목적

`src/000_server/settings.gs`와 `030_auth`에 섞여 있던 관리자 화면 책임을 분리한다.

Settings는 새로운 데이터 소유 도메인이 아니다. 사용자·역할·권한과 그 관계 및 런타임 권한 해석은 계속 Auth/IAM이 소유하고, Settings는 관리자 화면을 위한 조회와 향후 관리 요청을 조합하는 Application Layer로 정의한다.

현재 범위는 다음과 같다.

- Settings Home 시스템 상태 조회
- 사용자 관리 조회
- 역할 관리 조회
- 권한 관리 조회
- 시스템 관리자 접근 제어

사용자/역할/권한 저장 TODO는 이번 구조 리팩토링에서 구현하지 않는다.

향후 학년도, 시스템명, DB/Drive 설정, 외부 연동 등 실제 시스템 설정이 생기면 `070_settings` 아래 별도 feature를 추가한다.

## 2. 핵심 경계

### 2.1 Auth / IAM

`030_auth`는 UserDB 접근제어 데이터와 런타임 인증/인가 모델의 소유자다.

소유 책임:

- 로그인 사용자 원본 조회
- 사용자·역할·권한 원본 조회
- 사용자-역할 관계
- 역할-권한 관계
- 권한 행위 → 런타임 권한 키 변환
- 권한 트리 구성
- 역할별 권한 매트릭스 구성
- 런타임 API 권한 검사

특히 아래 함수는 로그인 컨텍스트 생성에도 사용되므로 Settings로 이동하지 않는다.

```text
actionToPermissionKey_
permissionScreenId_
buildPermissionTreeFromDb_
buildPermissionsByRoleFromDb_
requirePermission_
resolveRequiredPermissionScreenId_
throwPermissionError_
```

`040_login/login_context.gs`의 `buildUserPermissionsFromDb_()`와 `buildMenusFromPermissions_()`가 각각 역할별 권한 매트릭스와 권한 트리를 사용한다. 따라서 이 로직은 Settings 화면 모델이 아니라 IAM 런타임 모델이다.

### 2.2 Settings

`070_settings`는 관리자 Application Layer다.

소유 책임:

- 시스템 관리자 접근 확인
- 공통 Settings shell 데이터 구성
- 사용자 관리 화면 조회 모델 구성
- 역할 관리 화면 조회 모델 구성
- Auth/IAM이 계산한 권한 모델을 관리자 화면 response로 조합
- 향후 관리자 변경 요청 orchestration

Settings는 UserDB Sheet CRUD를 직접 수행하지 않는다.

현재 조회 흐름:

```text
Settings API
  -> Settings Query Service
      -> Auth/IAM read/model functions
          -> UserDB
```

향후 mutation 흐름:

```text
Settings API
  -> Settings Service
      -> Auth/IAM mutation service
          -> UserDB
```

## 3. 데이터 소유권

```text
users             -> Auth/IAM
roles             -> Auth/IAM
permissions       -> Auth/IAM
userRoles         -> Auth/IAM
rolePermissions   -> Auth/IAM
```

Settings에는 위 테이블의 별도 DAO를 만들지 않는다.

향후 Settings 자체 설정 데이터가 실제로 생길 때만 해당 feature가 자신의 DAO를 갖는다.

## 4. 목표 디렉터리 구조

```text
src/000_server/070_settings/
├─ 070_common/
│  ├─ settings_access.gs
│  └─ settings_shell_query_service.gs
├─ 071_users/
│  ├─ settings_users_api.gs
│  └─ settings_users_query_service.gs
├─ 072_roles/
│  ├─ settings_roles_api.gs
│  └─ settings_roles_query_service.gs
└─ 073_permissions/
   ├─ settings_permissions_api.gs
   └─ settings_permissions_query_service.gs
```

현재 mutation이 없으므로 `*_service.gs`, `*_validator.gs`, `*_sheet_dao.gs`를 억지로 만들지 않는다.

향후 확장 예시:

```text
074_system/
075_database/
076_integrations/
```

## 5. Common

### settings_access.gs

```text
getAdminSettingsCurrent_
```

현재 `api_getCurrentUser()` 기반 관리자 판정과 `FORBIDDEN` 응답을 그대로 유지한다.

### settings_shell_query_service.gs

```text
loadSettingsHomeData
buildSettingsBaseData_
```

현재 app/database/session/currentUser 반환 계약을 유지한다. `v0.7`, `2026학년도` 등 하드코딩 값도 구조 리팩토링 중 변경하지 않는다.

## 6. Users

### settings_users_api.gs

```text
loadSettingsUsersData
```

관리자 접근 확인 후 사용자 화면 조회 데이터를 반환한다.

### settings_users_query_service.gs

```text
listUsersForSettings_
```

Auth/IAM의 사용자·역할·사용자역할 read helper를 사용해 Settings 화면용 사용자 모델을 조합한다.

Auth에 유지:

```text
listUserRows_
findUserRowByEmail_
toUserDto_
```

## 7. Roles

### settings_roles_api.gs

```text
loadSettingsRolesData
```

### settings_roles_query_service.gs

```text
listRolesForSettings_
```

Auth/IAM 역할과 사용자역할 데이터를 읽어 `assignedCount`를 포함한 관리자 화면 모델을 만든다.

Auth에 유지:

```text
listRoleRows_
listUserRoleRows_
getRolesById_
getActiveRoleIdsByEmail_
toRoleDto_
summarizeRoleForUser_
```

## 8. Permissions

### Auth / IAM가 소유하는 권한 모델

```text
actionToPermissionKey_
permissionScreenId_
buildPermissionTreeFromDb_
buildPermissionsByRoleFromDb_
```

이 함수들은 Settings와 Login 양쪽에서 사용할 수 있지만 소유자는 Auth/IAM이다. Settings에 복제하지 않는다.

### settings_permissions_api.gs

```text
loadSettingsPermissionsData
```

관리자 접근을 확인하고 `getSettingsPermissionsData_(current)`를 호출한다.

### settings_permissions_query_service.gs

```text
getSettingsPermissionsData_
```

다음을 하나의 Settings 화면 response로 조합한다.

```text
roles              <- listRolesForSettings_()
permissionTree     <- buildPermissionTreeFromDb_()
permissionsByRole  <- buildPermissionsByRoleFromDb_()
columns            <- SETTINGS_PERMISSION_COLUMNS
```

Query Service 자체는 UserDB Sheet primitive를 직접 호출하지 않는다.

## 9. 의존 방향

허용:

```text
Settings -> Auth/IAM -> UserDB
Login    -> Auth/IAM -> UserDB
```

금지:

```text
Auth/Login -> Settings application function
Settings -> UserDB 직접 Sheet CRUD
Settings에 IAM 권한 계산 로직 복제
Query Service에서 write/lock/Drive mutation
```

## 10. 외부 동작 보존

다음 공개 함수와 반환 계약을 유지한다.

```text
loadSettingsHomeData
loadSettingsUsersData
loadSettingsRolesData
loadSettingsPermissionsData
```

추가로 유지한다.

- 관리자 판정 방식
- 현재 `FORBIDDEN` 응답
- Settings 프론트 HTML/JavaScript
- 사용자/역할/권한 저장 TODO
- UserDB 스키마
- 로그인/권한 정책

## 11. 테스트 및 구조 검증

행동 회귀 테스트는 다음을 고정한다.

- 관리자/비관리자 Settings 접근
- Settings Home 반환 구조
- 사용자 + 역할 조합
- 역할 `assignedCount`
- Auth/IAM 권한 트리
- Auth/IAM 역할별 권한 매트릭스
- Settings Permissions response 조합
- `loadSettingsPermissionsData`의 성공/접근실패 전달

구조 검증기는 다음을 확인한다.

- 루트 `src/000_server/settings.gs` 제거
- 목표 `070_settings` 파일 존재
- Settings 전용 함수 소유권
- IAM 권한 계산 함수가 `030_auth/permissions.gs`에 유지
- Auth/Login이 Settings application 함수에 의존하지 않음
- Settings의 UserDB 직접 Sheet 접근 금지
- Query Service write 금지
- 중복 함수 금지

## 12. 완료 기준

1. Settings 공개 함수명과 반환 계약이 유지된다.
2. Auth/IAM이 UserDB와 런타임 권한 모델을 소유한다.
3. Settings 화면 전용 조회 조합은 `070_settings`에 있다.
4. Login/Auth는 Settings에 의존하지 않는다.
5. Settings는 UserDB를 직접 소유하거나 수정하지 않는다.
6. 향후 `074+` feature 확장이 가능하다.
7. Settings 행동 회귀 테스트와 구조 검증이 통과한다.
