# 단일 연결 프로필 설계

## 1. 상태

- 작성일: 2026-09-02
- 대상 저장소: `TasupK/council_project`
- 상태: 사용자 승인 후 구현 계획 작성 전
- 범위: 운영 DB, 사용자 DB, 루트 폴더의 단일 연결 프로필

## 2. 배경

현재 외부 자원 ID는 `src/backend/app/config/config.gs`의 `DB_CONFIG`에 하드코딩되어 있다. 설정 홈은 사용자 DB와 루트 폴더 값 일부를 표시하지만, 운영 DB·사용자 DB·폴더를 실제로 검증하고 교체하는 기능은 없다. 폴더 연결 버튼도 비활성 상태다.

연도별 프로필이나 여러 후보 프로필을 관리하면 전환 상태와 데이터 격리 규칙이 복잡해진다. 이번 설계에서는 시스템 전체가 하나의 연결 프로필만 사용하고, 관리자가 검증된 새 자원으로 기존 연결을 교체하도록 단순화한다.

## 3. 목표

1. 시스템 전체에 연결 프로필을 하나만 둔다.
2. 프로필은 운영 DB 1개, 사용자 DB 1개, 루트 폴더 1개로 구성한다.
3. 연결 ID는 `Script Properties`를 단일 원본으로 사용한다.
4. 관리자는 설정 홈에서 각 자원을 독립적으로 최초 연결하거나 교체할 수 있다.
5. 새 자원이 검증을 통과하기 전에는 기존 연결을 변경하지 않는다.
6. 연결 변경 후 관련 캐시가 이전 자원을 계속 참조하지 않게 한다.
7. 기존 `DB_CONFIG` 값은 안전하게 일회성 마이그레이션한다.

## 4. 비목표

- 연도별 프로필
- 여러 프로필 저장과 활성 프로필 전환
- 자원 자동 생성
- 연결 해제
- 전체 연결 변경 이력 조회 화면
- 운영 DB 또는 UserDB 데이터 이관
- Google Drive 소유권 이전

연결 해제는 세 자원 모두 제공하지 않는다. 특히 UserDB는 로그인과 관리자 판정의 기반이므로 연결 해제 시 복구 UI에 접근할 수 없는 잠금 상태가 발생할 수 있다.

## 5. 핵심 결정

### 5.1 단일 프로필

저장 키는 다음 세 개다.

| 키 | 값 |
|---|---|
| `OPERATION_DB_ID` | 운영 Google Spreadsheet ID |
| `USER_DB_ID` | 사용자 Google Spreadsheet ID |
| `ROOT_FOLDER_ID` | 운영 Google Drive Folder ID |

연도, 프로필 ID, 활성 상태는 저장하지 않는다. 새 값이 저장되면 해당 자원의 기존 연결을 교체한다.

각 자원에는 마지막 변경 정보만 별도 키로 저장한다.

- `<RESOURCE_KEY>_UPDATED_AT`
- `<RESOURCE_KEY>_UPDATED_BY`

동시 변경과 캐시 세대 전환을 위해 다음 보조 키를 사용한다.

- `CONNECTION_PROFILE_REVISION`
- `LOGIN_CONTEXT_CACHE_GENERATION`

전체 변경 이력 저장소는 이번 범위에 포함하지 않는다.

### 5.2 접근 경계

다른 도메인은 `PropertiesService`나 `DB_CONFIG`를 직접 읽지 않는다. 연결 프로필 모듈의 조회 함수를 통해서만 현재 ID와 자원을 얻는다.

```text
Accounting / Event / Student Fee / IAM
  → Connection Profile Service
  → Script Properties
  → SpreadsheetApp 또는 DriveApp
```

후보 자원을 검증할 때는 현재 전역 연결을 임시로 바꾸지 않는다. 검증 함수에 후보 Spreadsheet 또는 Folder를 명시적으로 전달한다.

## 6. 서버 구성

### 6.1 연결 프로필 모듈

`src/backend/app/config` 아래에 단일 프로필 조회·저장·마이그레이션 책임을 둔다.

주요 내부 책임:

- 세 Script Properties 키 조회
- 누락 키에 대한 `NOT_CONNECTED` 오류
- 자원별 마지막 변경 메타데이터 조회
- 검증 완료 후보의 교체 저장
- 기존 `DB_CONFIG` 일회성 마이그레이션
- 연결 프로필 revision 관리

운영 DB·UserDB·폴더를 여는 기존 공통 함수는 이 모듈을 통해 ID를 얻도록 변경한다. 마이그레이션 완료 후 런타임에서 `DB_CONFIG`로 되돌아가는 fallback은 두지 않는다.

### 6.2 설정 API

기존 `api_getSettingsHome`은 세 연결 카드의 상태를 반환하도록 확장한다. 변경 API는 자원별로 분리한다.

- `api_updateOperationDbConnection`
- `api_updateUserDbConnection`
- `api_updateRootFolderConnection`

연결 해제 API는 만들지 않는다.

각 변경 요청은 다음 값을 받는다.

- 자원 URL
- 화면이 읽었던 현재 연결 ID 또는 revision

서버는 URL에서 ID를 추출하며, 클라이언트가 추출한 ID를 신뢰하지 않는다.

### 6.3 권한

조회 시 현재 설정 화면 접근 규칙을 유지한다. 연결 변경은 전용 권한 `SYSTEM_CONNECTION_MANAGE`를 서버에서 검사한다. 기본 관리자 역할 `role_admin`에 이 권한을 부여한다.

UserDB 교체 후보는 현재 관리자가 새 UserDB에서도 활성 사용자이며, 관리자 역할 또는 `SYSTEM_CONNECTION_MANAGE` 권한을 유지하는지 추가 검증한다. 이를 통과하지 못하면 교체를 거부하여 관리자 잠금을 예방한다.

## 7. 연결 변경 흐름

```text
URL 입력
→ 서버 권한 검사
→ 서버에서 후보 ID 추출
→ 현재 연결 ID/revision 읽기
→ 후보 자원 접근·구조·무결성 검증
→ 짧은 Script Lock 획득
→ 현재 ID/revision이 그대로인지 재확인
→ Script Properties와 변경 메타데이터 저장
→ revision 증가
→ Lock 해제
→ 관련 캐시 무효화
→ 새 카드 상태 반환
```

전체 무결성 검사를 수행하는 동안 Script Lock을 잡지 않는다. 로그인 컨텍스트 생성도 Script Lock을 사용하므로, 긴 검증 중 Lock을 유지하면 로그인 요청이 최대 대기시간까지 밀릴 수 있기 때문이다.

동시 변경은 낙관적 동시성으로 처리한다. 검증 후 Lock을 짧게 잡고 기존 ID 또는 revision이 요청 시작 시점과 같은지 확인한다. 다르면 `CONNECTION_CHANGED` 오류를 반환하고 관리자가 최신 상태를 다시 불러오게 한다.

저장이나 캐시 무효화 전에 검증이 실패하면 기존 Script Properties는 변경하지 않는다.

## 8. 검증 규칙

### 8.1 공통

- URL 형식과 ID 추출 가능 여부
- 기대한 자원 종류인지 여부
- Apps Script 실행 계정의 접근 가능 여부
- 휴지통 또는 삭제 상태 여부
- 기존 연결과 동일한 ID인 경우 변경 없음 처리

### 8.2 운영 DB

- `SpreadsheetApp.openById(candidateId)` 성공
- `getOperationDbSchema_()`가 요구하는 필수 시트 존재
- 필수 헤더 존재
- PK, FK, 업무키, 명시적 참조 규칙 검증
- 현재 UserDB를 참조하는 교차 FK 검증

현재 `validateOperationDbIntegrity_()`는 활성 운영 DB를 직접 열기 때문에 후보 Spreadsheet를 인자로 받는 형태로 내부 검증 경계를 분리한다. 검증을 위해 Script Properties를 선저장하지 않는다.

### 8.3 사용자 DB

- `SpreadsheetApp.openById(candidateId)` 성공
- `users`, `departments`, `roles`, `permissions`, `userRoles`, `rolePermissions` 시트 존재
- 필수 헤더 존재
- PK와 FK 무결성 검증
- 현재 운영 DB의 UserDB 교차 참조가 후보 UserDB에서도 유효한지 검증
- 현재 관리자 계정의 활성 상태 확인
- 현재 관리자에게 관리자 역할 또는 `SYSTEM_CONNECTION_MANAGE` 권한이 있는지 확인

현재 UserDB 조회 함수는 활성 DB를 직접 참조하므로, 후보 Spreadsheet에서 snapshot을 읽어 검증하는 함수로 분리한다.

### 8.4 루트 폴더

- `DriveApp.getFolderById(candidateId)` 성공
- 폴더가 휴지통 상태가 아님
- 실행 계정이 파일을 생성할 수 있음
- 쓰기 검증용 작은 임시 파일을 후보 폴더에 만들고 즉시 휴지통으로 이동

임시 파일 생성 또는 휴지통 이동이 실패하면 연결을 저장하지 않는다.

## 9. 설정 화면

설정 홈의 인프라 영역을 세 카드로 구성한다.

| 카드 | 표시 정보 | 동작 |
|---|---|---|
| 운영 DB | 상태, 파일명, 마지막 검증/변경 시각 | 최초 연결, 연결 변경, 열기 |
| 사용자 DB | 상태, 파일명, 마지막 검증/변경 시각 | 최초 연결, 연결 변경, 열기 |
| 파일 저장소 | 상태, 폴더명, 마지막 검증/변경 시각 | 최초 연결, 연결 변경, 열기 |

상태는 `연결됨`, `미연결`, `연결 오류`만 사용한다. 해제 버튼은 표시하지 않는다.

각 카드는 독립적으로 저장한다. 전체 프로필 저장 버튼은 만들지 않는다. 연결 변경은 확인창을 거친다. 검증 중에는 해당 카드의 버튼과 입력을 잠그고 진행 상태를 표시한다.

설정 홈을 열 때는 ID 존재와 자원 접근 여부만 가볍게 확인한다. 전체 스키마와 무결성 검사는 최초 연결 또는 교체 시에만 수행한다. 관리자가 필요할 때 실행하는 재검증 동작은 후속 범위로 둔다.

## 10. 응답과 오류

사용자에게는 조치 가능한 메시지를 반환한다.

| 코드 | 메시지 예시 |
|---|---|
| `INVALID_RESOURCE_URL` | 올바른 Google Sheets 또는 Drive 폴더 URL을 입력해 주세요. |
| `RESOURCE_ACCESS_DENIED` | 해당 자원에 접근할 권한이 없습니다. |
| `RESOURCE_TYPE_MISMATCH` | 선택한 자원의 종류가 올바르지 않습니다. |
| `REQUIRED_SHEET_MISSING` | 필수 시트 users가 없습니다. |
| `SCHEMA_INVALID` | 연결할 DB의 필수 컬럼 또는 무결성이 올바르지 않습니다. |
| `ADMIN_ACCESS_WOULD_BE_LOST` | 새 사용자 DB에서 현재 관리자의 접근 권한을 확인할 수 없습니다. |
| `FOLDER_NOT_WRITABLE` | 선택한 폴더에 파일을 생성할 수 없습니다. |
| `CONNECTION_CHANGED` | 다른 관리자가 연결을 변경했습니다. 최신 상태를 다시 불러와 주세요. |
| `NOT_CONNECTED` | 필요한 시스템 자원이 연결되지 않았습니다. |

서버 로그에는 원래 예외와 후보 자원 종류를 기록하되 사용자 응답에 스택과 내부 구현 정보는 노출하지 않는다.

## 11. 캐시

연결 변경 후 이전 자원을 기준으로 만들어진 캐시를 재사용하지 않는다.

- 운영 DB 변경: 운영 데이터 관련 캐시 revision 증가 또는 해당 캐시 삭제
- UserDB 변경: 로그인 컨텍스트 cache generation 증가
- 루트 폴더 변경: 폴더 관련 캐시 삭제 또는 revision 증가

현재 로그인 캐시는 이메일 해시만 키에 포함하므로 UserDB를 교체해도 기존 캐시가 최대 10분 남을 수 있다. `buildLoginContextCacheKey_()`에 cache generation을 포함해, UserDB 교체 직후 기존 캐시 키가 더 이상 조회되지 않게 한다. 모든 사용자 이메일 키를 열거하여 삭제하는 방식에는 의존하지 않는다.

## 12. 마이그레이션과 배포

마이그레이션은 다음 순서로 진행한다.

1. `migrateLegacyConnectionProfile_()`를 추가한다.
2. Script Properties에 키가 없을 때만 현재 `DB_CONFIG` 세 값을 검증 후 저장한다.
3. 마이그레이션 함수를 실행하고 세 키를 확인한다.
4. 운영 DB, UserDB, 폴더 opener가 Script Properties를 읽도록 전환한다.
5. `DB_CONFIG`의 세 ID와 런타임 fallback을 제거한다.
6. 설정 홈에서 세 카드와 파일/폴더 열기를 확인한다.

마이그레이션은 반복 실행해도 이미 존재하는 Script Properties를 덮어쓰지 않는다. 세 연결 키가 모두 없을 때만 검증 후 한 번에 저장하고, 세 키가 모두 있으면 no-op으로 끝낸다. 일부 키만 존재하면 `PARTIAL_CONNECTION_PROFILE` 오류로 중단하여 기존 값과 하드코딩 값이 섞이지 않게 한다. 하나라도 후보 값 검증에 실패하면 부분 저장하지 않고 실패한다.

## 13. 테스트

### 13.1 단위 테스트

- Spreadsheet URL과 Folder URL의 ID 추출
- 잘못된 URL 및 자원 종류 거부
- Script Properties 조회와 누락 오류
- 기존 값과 동일한 후보의 변경 없음 처리
- revision 비교와 동시 변경 충돌
- 마이그레이션의 멱등성
- cache generation이 로그인 캐시 키에 포함되는지 검증

### 13.2 서버 통합 테스트

- 세 자원의 정상 최초 연결
- 세 자원의 정상 교체
- 권한 없는 사용자의 변경 거부
- 후보 DB의 필수 시트·헤더·무결성 오류
- 새 UserDB에서 현재 관리자 권한 상실 방지
- 새 UserDB가 현재 운영 DB의 교차 참조를 깨는 경우 거부
- 쓰기 불가능한 폴더 거부
- 검증 실패 시 기존 ID 유지
- 동시 변경 중 하나만 성공
- UserDB 변경 직후 기존 로그인 컨텍스트 캐시 미사용
- 하드코딩 값의 일회성 마이그레이션

### 13.3 화면 테스트

- 연결 상태와 파일·폴더명 표시
- URL 입력, 검증 진행, 성공, 실패 상태
- 연결 변경 확인창
- 성공 후 카드 즉시 갱신
- 실패 후 기존 카드와 열기 링크 유지
- 해제 버튼과 프로필·연도 UI가 존재하지 않음

## 14. 완료 기준

- 모든 런타임 자원 접근이 단일 연결 프로필 모듈을 경유한다.
- `DB_CONFIG`에 외부 자원 ID가 남아 있지 않다.
- 세 연결을 설정 홈에서 검증 후 교체할 수 있다.
- 검증 실패와 동시 변경이 기존 연결을 훼손하지 않는다.
- UserDB 교체 후 관리자 접근과 로그인 캐시가 안전하다.
- 연결 해제, 연도, 프로필 목록 관련 코드와 UI가 없다.
- 관련 단위·통합·화면 검증이 통과한다.
