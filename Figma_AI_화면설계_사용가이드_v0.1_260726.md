# Figma AI 화면설계 사용 가이드

- 적용 프로젝트: 학생회 통합업무관리 시스템
- 버전: v0.1
- 작성일: 2026-07-26
- 확인일: 2026-07-26
- 함께 사용할 문서: [AI 화면설계 지침](./AI_화면설계_지침_v0.1_260726.md)

## 개요

이 문서는 Figma와 AI 도구를 처음 사용하는 팀원이 Codex, Cursor 또는 Claude Code에 Talk To Figma MCP를 연결하고, 공통 App Shell을 바탕으로 업무용 웹 화면을 설계하는 방법을 설명합니다.

Talk To Figma MCP는 AI가 현재 열려 있는 Figma 파일을 조회하고 수정할 수 있게 하는 오픈소스 연동 도구입니다. 이 문서에서는 Talk To Figma MCP를 실제 편집 수단으로 사용합니다. 공식 Figma Connector를 함께 사용할 수 있지만, 여기서는 읽기와 스크린샷 확인을 보조하는 선택 기능으로만 다룹니다.

## 목표

이 문서를 끝까지 따르면 다음 작업을 수행할 수 있습니다.

- Talk To Figma MCP, WebSocket 중계 서버와 Figma 플러그인을 설치합니다.
- Codex, Cursor 또는 Claude Code 중 사용하는 AI 클라이언트에 MCP 서버를 등록합니다.
- 채널에 연결한 뒤 AI가 올바른 문서, Page와 Frame을 보고 있는지 확인합니다.
- 공통 AI 지침과 업무 요구사항을 전달하고, 화면 구조를 승인한 뒤에만 편집을 시작합니다.
- 복제한 App Shell의 Content Workspace에서 기존 컴포넌트를 재사용합니다.
- 스크린샷, Node ID와 점검 목록으로 결과를 검수합니다.

## 시작 전에 알아둘 용어

| 용어 | 뜻 |
|---|---|
| Figma | 여러 사람이 화면과 컴포넌트를 함께 설계하는 도구입니다. 이 가이드는 Figma Desktop에서 대상 파일을 열어 둔 상태를 기준으로 합니다. |
| 플러그인 | Figma 안에서 실행되는 확장 프로그램입니다. Talk To Figma 플러그인은 현재 Figma 파일과 WebSocket 서버를 연결합니다. |
| MCP | Model Context Protocol의 약자입니다. AI 클라이언트가 외부 도구의 기능을 공통 방식으로 찾고 실행하게 해 주는 연결 규격입니다. |
| MCP 서버 | AI에게 Figma 조회·편집 도구를 제공하는 프로그램입니다. 이 가이드에서는 `cursor-talk-to-figma-mcp` 패키지를 사용합니다. |
| WebSocket | 프로그램 사이의 연결을 계속 유지하며 메시지를 주고받는 통신 방식입니다. MCP 서버와 Figma 플러그인 사이의 중계에 사용합니다. |
| 채널 | 같은 WebSocket 서버에서 한 작업 연결을 구분하는 식별자입니다. Figma 플러그인에 표시된 채널명을 AI에게 정확히 전달해야 합니다. |
| Page | Figma 파일 안에서 화면과 컴포넌트를 분류하는 큰 작업 공간입니다. 파일 하나에 여러 Page가 있을 수 있습니다. |
| Frame | 한 화면이나 화면 영역을 담는 컨테이너입니다. 이 가이드에서는 공통 App Shell Frame을 복제해 사용합니다. |
| Node ID | Figma의 Frame, 텍스트, 컴포넌트 등 각 요소에 붙는 고유 식별자입니다. AI는 조회 결과로 받은 정확한 ID를 사용해야 합니다. |
| 컴포넌트 인스턴스 | 원본 컴포넌트의 구조와 스타일을 이어받아 화면에서 사용하는 복제 항목입니다. 버튼이나 배지의 일관성을 유지하는 데 사용합니다. |
| Content Workspace | App Shell 안에서 업무별 목록, 필터, 모달 등을 작성하도록 정한 본문 영역입니다. Header와 Sidebar 같은 공통 영역은 여기에 포함되지 않습니다. |

## 전체 연결 구조

연결은 다음 순서로 동작합니다.

`AI 클라이언트 → MCP 서버 → WebSocket 채널 → Figma 플러그인 → 열린 Figma 파일`

```text
AI 클라이언트(Codex / Cursor / Claude Code)
  → Talk To Figma MCP 서버
  → WebSocket 중계 서버와 채널
  → Figma Talk To Figma 플러그인
  → 현재 Figma Desktop에서 열어 둔 파일
```

각 단계의 역할은 다릅니다.

1. AI 클라이언트는 사용자의 요청을 이해하고 MCP 도구를 선택합니다.
2. MCP 서버는 `get_document_info`, `get_node_info`, `clone_node` 같은 Figma 도구를 제공합니다.
3. WebSocket 서버는 AI 쪽 MCP 서버와 Figma 플러그인의 메시지를 중계합니다.
4. 채널은 어느 플러그인 연결로 명령을 보낼지 구분합니다.
5. Figma 플러그인은 현재 열려 있는 파일에 조회와 편집 명령을 적용합니다.

따라서 `join_channel` 성공 메시지만으로 올바른 파일에 연결되었다고 판단하면 안 됩니다. 연결 후 문서명, Page와 최상위 Frame을 실제로 조회해야 합니다.

## 준비물

- Figma Desktop과 편집 권한이 있는 대상 Figma 파일
- Codex, Cursor 또는 Claude Code 중 하나
- Git
- Bun JavaScript 런타임
- 명령을 실행할 PowerShell 또는 터미널
- [Talk To Figma MCP 공식 저장소](https://github.com/grab/cursor-talk-to-figma-mcp)

처음 설정하는 Windows 사용자는 Windows PowerShell과 Windows 경로만 사용하는 방식을 권장합니다. WSL을 선택했다면 저장소, Bun과 AI 클라이언트가 어느 운영체제 환경에서 실행되는지 구분해야 합니다. 한 설정 예시 안에 `C:\...`와 `/home/...` 경로를 섞지 마세요.

## 1. Talk To Figma MCP 설치

2026-07-26에 [Talk To Figma MCP 공식 저장소](https://github.com/grab/cursor-talk-to-figma-mcp)의 설치 방법을 확인했습니다. 저장소는 `bun socket`, `bunx cursor-talk-to-figma-mcp@latest`, 개발 플러그인 manifest와 `join_channel` 사용을 안내합니다.

### 1.1 Bun 설치

Windows PowerShell에서는 저장소가 안내하는 다음 명령으로 Bun을 설치할 수 있습니다.

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

이 명령은 인터넷에서 설치 스크립트를 받아 실행합니다. 조직에서 외부 스크립트 실행을 제한한다면 먼저 관리자 정책을 확인하고 [Bun 공식 설치 안내](https://bun.sh/docs/installation)에 따라 승인된 방법을 사용하세요.

설치 후 새 PowerShell을 열고 확인합니다.

```powershell
bun --version
bunx --version
```

두 명령이 버전을 출력하지 않으면 터미널을 다시 열어 PATH 환경 변수 반영 여부를 확인합니다.

### 1.2 저장소 내려받기와 의존성 설치

작업 도구를 둘 폴더에서 실행합니다.

```powershell
git clone https://github.com/grab/cursor-talk-to-figma-mcp.git
Set-Location cursor-talk-to-figma-mcp
bun install
```

이 저장소 폴더는 WebSocket 서버를 실행하고 로컬 개발 플러그인의 manifest를 찾는 데 사용합니다. 팀이 정한 공용 도구 경로가 있다면 그 경로를 사용하세요.

공식 저장소의 빠른 설치는 `bun setup`도 안내하지만, 이 명령은 현재 Cursor 프로젝트의 MCP 설정까지 설치합니다. 이 가이드는 Codex와 Claude Code도 같은 절차를 사용할 수 있도록 `bun install`로 저장소 의존성만 설치하고, 3장에서 AI 클라이언트별 MCP 설정을 직접 등록합니다.

### 1.3 WebSocket 서버 시험 실행

저장소 폴더에서 실행합니다.

```powershell
bun socket
```

이 터미널은 화면 작업이 끝날 때까지 열어 둡니다. 종료하려면 해당 터미널에서 `Ctrl+C`를 누릅니다.

## 2. Figma 플러그인 설치

다음 두 방법 중 하나를 선택합니다.

### 방법 A. Figma Community에서 설치

[Talk To Figma MCP 플러그인 Figma Community 페이지](https://www.figma.com/community/plugin/1485687494525374295/cursor-talk-to-figma-mcp-plugin)에서 플러그인을 설치합니다. 팀 전체가 같은 공개 버전을 사용하기 쉬운 방법입니다.

### 방법 B. 개발 플러그인으로 연결

1. Figma Desktop을 실행합니다.
2. 메뉴에서 `Plugins > Development > New Plugin`으로 이동합니다.
3. `Link existing plugin`을 선택합니다.
4. 내려받은 저장소의 `src/cursor_mcp_plugin/manifest.json`을 선택합니다.
5. 대상 Figma 파일을 열고 `Plugins > Development`에서 연결한 플러그인을 실행합니다.

개발 플러그인은 저장소 폴더를 이동하거나 삭제하면 manifest 경로를 찾지 못할 수 있습니다. 저장소 위치를 바꾸려면 Figma에서 플러그인을 다시 연결해야 합니다.

## 3. AI 클라이언트에 MCP 등록

Talk To Figma MCP는 로컬 명령으로 시작하는 `stdio` 방식의 MCP 서버입니다. 아래에서 실제로 사용하는 AI 클라이언트 하나만 설정하면 됩니다. 등록 후에는 해당 클라이언트를 완전히 다시 시작하세요.

### Codex

[Codex MCP 공식 문서](https://developers.openai.com/codex/mcp/)에 따르면 Codex CLI, IDE 확장과 같은 Codex 호스트는 `config.toml`의 MCP 설정을 공유합니다.

가장 간단한 CLI 등록 명령은 다음과 같습니다.

```powershell
codex mcp add TalkToFigma -- bunx cursor-talk-to-figma-mcp@latest
codex mcp list
```

직접 설정할 때는 사용자 전체 설정인 `~/.codex/config.toml` 또는 신뢰된 프로젝트의 `.codex/config.toml`에 다음 내용을 추가합니다. Windows의 `~`는 보통 `C:\Users\사용자명`을 뜻합니다.

```toml
[mcp_servers.TalkToFigma]
command = "bunx"
args = ["cursor-talk-to-figma-mcp@latest"]
```

- 사용자 설정: 모든 Codex 작업에서 사용하려면 `~/.codex/config.toml`
- 프로젝트 설정: 한 프로젝트에서만 사용하려면 프로젝트 루트의 `.codex/config.toml`
- 확인: 터미널에서 `codex mcp list`, Codex 대화 화면에서 `/mcp`

Codex Desktop에서는 `Settings > MCP servers > Add server`에서 STDIO 서버 이름, 명령과 인수를 입력한 뒤 저장하고 재시작하는 방법도 사용할 수 있습니다.

### Cursor

[Cursor MCP 공식 문서](https://docs.cursor.com/context/model-context-protocol)는 프로젝트 설정과 사용자 전체 설정에 `mcp.json`을 사용합니다.

- 프로젝트 설정: 프로젝트 루트의 `.cursor/mcp.json`
- 사용자 전체 설정: `~/.cursor/mcp.json`

해당 파일에 다음 내용을 저장합니다. 기존 `mcpServers`가 있다면 그 객체 안에 `TalkToFigma` 항목만 추가하세요.

```json
{
  "mcpServers": {
    "TalkToFigma": {
      "command": "bunx",
      "args": ["cursor-talk-to-figma-mcp@latest"]
    }
  }
}
```

Cursor를 다시 시작한 뒤 `Settings > Tools & MCP`에서 `TalkToFigma`가 활성 상태이고 도구 목록이 보이는지 확인합니다. Cursor Agent CLI를 사용한다면 다음 명령으로 서버 상태와 제공 도구를 확인할 수 있습니다.

```powershell
cursor-agent mcp list
cursor-agent mcp list-tools TalkToFigma
```

### Claude Code

[Claude Code MCP 공식 문서](https://docs.anthropic.com/en/docs/claude-code/mcp)는 로컬 `stdio` 서버 명령과 인수를 `--` 뒤에 적도록 안내합니다.

현재 프로젝트에 기본 로컬 범위로 등록하려면 실행합니다.

```powershell
claude mcp add TalkToFigma -- bunx cursor-talk-to-figma-mcp@latest
claude mcp list
```

범위는 다음과 같이 선택할 수 있습니다.

- 로컬 범위 기본값: 현재 프로젝트용 항목을 `~/.claude.json`에 저장합니다.
- 프로젝트 범위: `--scope project`를 추가하며 프로젝트 루트의 `.mcp.json`에 저장합니다. 팀 공유 전에는 명령의 출처와 권한을 검토해야 합니다.
- 사용자 범위: `--scope user`를 추가하며 여러 프로젝트에서 사용할 수 있도록 `~/.claude.json`에 저장합니다.

예를 들어 사용자 범위 등록은 다음과 같습니다.

```powershell
claude mcp add --scope user TalkToFigma -- bunx cursor-talk-to-figma-mcp@latest
claude mcp list
```

Claude Code를 다시 시작한 뒤 대화 안에서 `/mcp`를 실행해 연결 상태와 도구 수를 확인합니다. 프로젝트 범위 서버가 `Pending approval`로 표시되면 신뢰할 수 있는 저장소인지 확인한 뒤 대화형 승인 절차를 완료합니다.

## 4. WebSocket 서버와 채널 연결

설정이 끝났다면 다음 순서를 매 작업마다 반복합니다.

1. Talk To Figma MCP 저장소 폴더에서 `bun socket`을 실행하고 터미널을 열어 둡니다.
2. Figma Desktop에서 작업할 파일을 엽니다.
3. 대상 파일 안에서 Talk To Figma 플러그인을 실행합니다.
4. 플러그인에 표시된 채널 ID를 복사합니다.
5. Codex, Cursor 또는 Claude Code에서 새 대화를 엽니다.
6. 다음 메시지의 `{채널명}`을 실제 채널 ID로 바꿔 전송합니다.

```text
Talk To Figma MCP 채널 {채널명}에 연결하고, 현재 문서명·Page·최상위 Frame을 조회해 주세요. 조회 전에는 수정하지 마세요.
```

AI는 먼저 `join_channel`에 해당하는 채널 참가 도구를 실행한 뒤 문서 조회 도구를 사용해야 합니다. AI 클라이언트마다 도구 앞에 붙는 이름은 다를 수 있지만 기능은 같습니다.

## 5. 첫 연결 확인

AI의 응답에서 다음 항목을 직접 확인합니다.

- 연결한 채널 ID가 플러그인에 표시된 값과 정확히 같습니다.
- 문서명이 현재 Figma Desktop에서 열어 둔 파일명과 같습니다.
- Page 이름과 ID가 작업할 Page와 같습니다.
- 최상위 Frame 이름과 ID에 대상 App Shell 또는 복제할 Frame이 포함됩니다.
- AI가 아직 노드를 생성, 수정, 이동, 복제하거나 삭제하지 않았습니다.

하나라도 다르면 다음과 같이 요청합니다.

```text
대상이 일치하지 않습니다. 지금은 수정하지 마세요. 현재 연결 채널과 문서명, Page, 최상위 Frame을 다시 조회해 표로 보고해 주세요.
```

연결 확인이 끝난 뒤에만 화면 요구사항 정리로 넘어갑니다.

## 6. AI 지침 적용

### 가장 쉬운 공통 방법

Codex, Cursor와 Claude Code에서 모두 사용할 수 있는 방법은 새 작업의 첫 메시지에 [AI 화면설계 지침](./AI_화면설계_지침_v0.1_260726.md)의 `복사해서 사용하는 AI 지침` 전체를 붙여 넣는 것입니다.

1. 새 대화를 엽니다.
2. AI 지침의 코드 블록 전체를 첫 메시지로 전달합니다.
3. AI가 지침을 이해했다고 답하면 `작업 요청 입력 양식`을 전달합니다.
4. 연결과 기존 화면 조사를 먼저 요청합니다.
5. AI가 제안한 화면 구조를 검토하고 명시적으로 승인합니다.

채널명, Figma 파일명과 Frame ID는 작업마다 달라질 수 있으므로 영구 지침에 고정하지 마세요. 실제 개인정보, 접근 토큰이나 조직의 비공개 주소도 지침 파일에 적지 않습니다.

### 선택 사항: 프로젝트에 지침을 계속 적용하기

같은 프로젝트에서 반복 사용할 때만 다음 위치를 고려합니다.

| AI 클라이언트 | 지속 지침 위치 | 적용 범위 |
|---|---|---|
| Codex | 프로젝트의 `AGENTS.md` | 해당 파일이 적용되는 프로젝트 또는 하위 폴더 |
| Cursor | Cursor Project Rules 또는 프로젝트의 `.cursor/rules` | 해당 Cursor 프로젝트 |
| Claude Code | 프로젝트의 `CLAUDE.md` | 해당 Claude Code 프로젝트 |

팀 저장소에 지침을 추가하면 모든 팀원의 AI 작업에 영향을 줄 수 있습니다. 조직의 AI 도구 정책과 코드 리뷰 절차를 확인한 뒤 추가하고, 이 문서의 AI 지침 본문만 옮기세요. 설치 경로, 개인 채널명과 사용자별 설정은 공유 지침에 넣지 않습니다.

### 전체 작업 순서

화면 한 개를 만들 때 다음 순서를 지킵니다.

```text
조사 → 질문과 요구사항 정리 → 화면 구조 제안 → 사용자 승인 →
원본 Frame 복제 → Content Workspace 편집 → 단계별 검증 →
임시 노드 정리 → 최종 보고
```

## 7. 화면 설계 요청

아래 프롬프트는 `{중괄호}` 부분을 실제 값으로 바꿔 사용합니다. 모르는 값은 추측하지 말고 `미정`이라고 적습니다.

### A. 연결과 조사 요청

이 프롬프트는 Figma를 수정하지 않고 연결 대상과 사용 가능한 컴포넌트를 확인합니다.

```text
Talk To Figma MCP 채널 {채널명}에 연결해 주세요.

수정하기 전에 다음을 조회하고 표로 보고해 주세요.
1. 현재 문서명과 문서 ID
2. 현재 Page 이름과 ID
3. 최상위 Frame 이름, ID와 크기
4. 원본 App Shell과 Content Workspace의 이름, ID와 자식 구조
5. 이 Page에서 재사용할 수 있는 버튼, 배지, 입력 필드, 탭, 표와 모달 컴포넌트
6. 이미 만들어진 유사 업무 화면과 원본 템플릿의 차이

채널 참가 성공만 보고하지 말고 실제 문서 정보를 조회해 주세요.
지금은 노드를 생성, 수정, 이동, 복제하거나 삭제하지 마세요.
```

AI가 다른 문서나 Page를 보고하면 Figma Desktop에서 올바른 파일을 다시 열고 이 프롬프트를 반복합니다.

### B. 업무 요구사항 전달

다음 양식은 화면에 필요한 업무 규칙을 빠뜨리지 않도록 만든 요청서입니다.

```text
[화면 작업 요청]

목적: {이 화면으로 해결할 업무}
작업 대상 Figma 파일: {파일명 또는 공유 링크}
Talk To Figma MCP 채널: {채널명}
Page·Frame: {대상 Page와 복제할 원본 Frame}
공통 템플릿: {App Shell 이름과 ID}
재사용 컴포넌트: {조사에서 확인한 컴포넌트 이름과 ID}

업무 시작 조건: {어떤 사건으로 데이터가 생성되는지}
관리 데이터: {목록과 확인 작업에 필요한 항목}
상태 전환: {시작 상태, 중간 상태와 종료 상태}
계산 규칙: {금액, 기간, 합계 또는 파생값 계산}
예외와 경고: {지연, 불일치, 초과 등 주의가 필요한 조건}
담당자 작업: {조회, 확인, 입력, 승인과 취소 작업}
권한과 개인정보: {열람·수정 범위와 마스킹 규칙}
알림과 기록: {메일, 상태 변경자, 변경 시각과 근거 기록}

확정: {사용자가 결정한 정책}
미정: {아직 결정하지 않은 정책}
만들지 않을 화면: {상세 페이지 등 현재 범위 밖의 화면}
완료 기준: {필요한 상태, 검증 스크린샷과 보고 항목}

위 내용을 사실, 결정, 미정으로 나눠 정리해 주세요.
화면 구조에 영향을 주는 질문을 한 번에 하나씩 해 주세요.
먼저 화면 구조만 제안하고 제가 승인하기 전에는 Figma를 편집하지 마세요.
```

AI의 질문에 답하면서 확정된 항목은 `결정`으로 옮깁니다. 아직 정할 수 없는 정책은 현재 화면에서 제외하거나 가정안을 별도로 제시하게 합니다.

### C. 설계 승인 후 편집 요청

AI가 화면 목적, 정보 구조, 주요 영역과 예외 상태를 제안했고 사용자가 검토를 마친 뒤에만 전송합니다.

```text
제안한 화면 구조를 승인합니다. 승인된 구조만 구현해 주세요.

다음 조건을 지켜 주세요.
- 원본 Frame이 아닌 복제본에서 작업해 주세요.
- 복제한 Frame 이름은 `{새 Frame 이름}`으로 지정해 주세요.
- Header, Sidebar, Page Header와 Status Bar의 공통 구조는 유지해 주세요.
- 업무 화면은 Content Workspace를 중심으로 작성해 주세요.
- 조사에서 확인한 기존 컴포넌트만 사용해 주세요.
- 모든 변경은 조회로 확인한 정확한 Node ID를 사용해 주세요.
- 영역별로 생성한 뒤 Node ID 또는 스크린샷으로 확인해 주세요.
- 대체 요소를 검증하기 전에는 기존 노드를 삭제하지 마세요.
- 예시 데이터는 모두 가상값과 마스킹된 형식으로 작성해 주세요.

한 번에 전체를 만들지 말고 다음 순서로 진행해 주세요.
1. 복제 Frame과 Content Workspace 확인
2. Page Header와 요약 영역
3. 필터와 주요 행동
4. 목록 또는 핵심 업무 패턴
5. 승인된 모달과 예외 상태
6. 전체 Frame 검증과 임시 노드 정리

각 단계가 끝날 때 변경한 Node ID와 검증 결과를 짧게 보고해 주세요.
```

### D. 수정과 최종 검수 요청

수정할 때는 위치와 기대 결과를 함께 적습니다. 마지막에는 다음 프롬프트로 전체 검수를 요청합니다.

```text
현재 작업 Frame을 최종 검수해 주세요.

1. 기본 입력 문구, 기본 버튼 문구, 샘플 설명과 빈 텍스트를 검사해 주세요.
2. 마스킹되지 않은 이름, 학번, 계좌, 연락처 등 개인정보가 없는지 검사해 주세요.
3. 실패한 시도에서 남은 임시 노드와 중복 노드를 검사해 주세요.
4. 텍스트 잘림, 요소 겹침, 컨테이너 밖 넘침과 정렬 오류를 검사해 주세요.
5. 원본 App Shell이 수정되지 않았는지 확인해 주세요.
6. Content Workspace, 목록·모달 같은 복합 패턴, 전체 Frame의 스크린샷을 각각 확인해 주세요.

오류가 있으면 정확한 Node ID와 수정안을 먼저 보고해 주세요.
수정 후 다시 검사하고, 완료 보고 양식에 맞춰 Frame 링크와 제한사항을 보고해 주세요.
```

### 학생회비 관리 예시

다음은 프롬프트 작성 방법을 보여 주는 축약 예시입니다. 특정 화면 배치를 의무화하는 설계안이 아닙니다.

```text
[화면 작업 요청]

목적: 학생회비 신청자와 납부 상태를 한 목록에서 관리
작업 대상 Figma 파일: {팀 Figma 파일}
Talk To Figma MCP 채널: {채널명}
Page·Frame: {Page1 / 내부 업무용 웹 App Shell}
공통 템플릿: {조사한 App Shell 이름과 ID}
재사용 컴포넌트: {조사한 버튼, 배지, 입력 필드, 표와 모달 컴포넌트}

업무 시작 조건: 필수값을 모두 입력한 Google Form 제출
관리 데이터: 신청자 이름, 학번, 계좌번호, 모집 등급, 남은 학기 수, 필요 납부 금액, 누적 납부액과 잔액
상태 전환: 납부 대기 → 부분납부 → 완납
계산 규칙: 필요 납부 금액에서 누적 납부액을 빼 잔액 표시
예외와 경고: 확인 필요 / 매칭 확인 필요 / 초과 납부
담당자 작업: 매칭 후보를 확인하고 누적 납부액·근거·사유를 입력한 뒤 반영
권한과 개인정보: 미정. 예시 행은 김○○, 2026****, 110-***-****12처럼 마스킹
알림과 기록: 완납 확정 때만 자동 메일 발송, 상태 변경자와 변경 시각 기록

확정: 경고는 상태와 분리, 초과 납부는 경고로 표시, 담당자 확인 후 반영
미정: 개인정보 열람·수정 권한, 거래 내역 파일 보존 방식
만들지 않을 화면: 상세 페이지 없음. 목록과 확인·반영 모달만 작성
완료 기준: 세 가지 납부 상태와 세 가지 경고가 목록에서 구분되고, 모달에서 현재 납부 금액·근거·사유를 입력할 수 있음

먼저 사실, 결정, 미정을 정리하고 화면 구조만 제안해 주세요.
제가 승인하기 전에는 Figma를 편집하지 마세요.
```

예시 값은 형식만 보여 줍니다. 팀원이 실제 신청자 정보나 입금 내역을 프롬프트와 Figma 시안에 붙여 넣어서는 안 됩니다.

## 8. 작업 중 확인과 수정

AI가 한 영역을 만든 뒤에는 Node ID 또는 스크린샷을 요청해 위치, 텍스트와 컴포넌트 사용을 확인합니다. 수정 방향은 한 번에 하나씩 전달하고, 원본 App Shell이나 공통 영역을 바꾸지 않았는지 계속 확인합니다.

### AI의 질문에 답하는 방법

질문에는 결정 내용과 화면 영향을 함께 답합니다.

```text
결정: 확인 필요는 납부 상태가 아니라 별도 경고로 표시해 주세요.
화면 영향: 상태 배지와 경고 배지를 같은 셀에 섞지 말고 구분해 주세요.
```

### 잘못된 가정을 바로잡는 방법

AI가 확정되지 않은 정책을 임의로 채웠다면 다음 문구를 사용합니다.

```text
이 항목은 아직 미정입니다. 화면에서 제외하고 미정 사항으로 기록해 주세요.
```

```text
지금은 편집하지 말고 화면 구조만 제안해 주세요.
```

AI가 파일에 없는 UI를 새로 만들려고 하면 다음과 같이 요청합니다.

```text
새 컴포넌트를 만들지 말고 원본 파일에서 사용 가능한 대안을 다시 찾아 주세요.
```

### 안전하게 작업을 멈추는 방법

다른 문서나 원본 Frame을 수정했거나 결과를 검토해야 할 때는 다음 문구로 즉시 중단합니다.

```text
현재 작업을 중단하고 지금까지 생성한 노드 ID와 변경 내용을 보고해 주세요. 기존 노드는 삭제하지 마세요.
```

중단 보고를 받은 뒤에는 생성한 노드, 수정한 노드와 원본 변경 여부를 확인합니다. 무엇을 되돌릴지 확정하기 전에는 AI에게 일괄 삭제를 요청하지 않습니다.

### 구체적인 수정 요청 예시

```text
목록의 `잔액` 열만 수정해 주세요.
금액 오른쪽에 경고 배지를 추가하지 말고, 초과 납부인 행의 기존 경고 영역에만 `초과 납부`를 표시해 주세요.
수정 전 대상 셀과 경고 영역의 Node ID를 조회하고, 수정 후 같은 범위의 스크린샷을 확인해 주세요.
```

## 9. 최종 검수

완성된 Content Workspace, 목록과 모달 같은 복합 패턴, 전체 Frame을 각각 확인합니다. AI의 성공 메시지가 아니라 실제 Figma 결과를 기준으로 완료 여부를 판단합니다.

### 화면 검수 목록

- 문서명, Page, 작업 Frame 이름과 ID가 처음 승인한 대상과 같습니다.
- 원본 App Shell의 구조와 내용이 바뀌지 않았습니다.
- 업무 UI가 복제본의 Content Workspace 안에 있습니다.
- 버튼, 배지, 입력 필드, 표와 모달이 조사에서 확인한 컴포넌트 인스턴스입니다.
- 승인하지 않은 상세 페이지, 고정 패널 또는 권한별 화면이 추가되지 않았습니다.
- 기본 문구, 빈 설명, 중복 요소와 실패한 임시 노드가 없습니다.
- 한글 텍스트가 잘리지 않고 요소가 겹치거나 Frame 밖으로 넘치지 않습니다.
- 예시 이름, 학번, 계좌와 연락처가 가상값이며 마스킹되어 있습니다.
- 미정 정책이 확정 기능처럼 표현되지 않았습니다.

### 필요한 검증 화면

1. Content Workspace 전체가 보이는 화면
2. 목록·필터·모달 등 핵심 복합 패턴이 읽히는 화면
3. Header, Sidebar, Page Header, 본문과 Status Bar가 모두 보이는 전체 Frame

### 완료 보고 확인

AI가 [AI 화면설계 지침](./AI_화면설계_지침_v0.1_260726.md)의 `완료 보고 양식`에 맞춰 다음을 보고했는지 확인합니다.

- 연결 채널과 확인한 문서·Page
- 편집한 Frame 이름, ID와 링크
- 주요 변경 내용과 재사용한 컴포넌트
- 삭제한 임시 노드와 삭제하지 못한 항목
- 스크린샷 검증, 기본 문구 검사와 개인정보 마스킹 검사 결과
- 미정 사항, 도구 오류와 남은 제한사항

## 문제 해결

문제가 생기면 AI에게 같은 명령을 반복시키기 전에 어느 연결 단계가 실패했는지 확인합니다.

| 증상 | 먼저 확인할 항목 | 조치 |
|---|---|---|
| AI에 TalkToFigma 도구가 보이지 않음 | Codex는 `codex mcp list`, Cursor는 `Settings > Tools & MCP` 또는 `cursor-agent mcp list`, Claude Code는 `claude mcp list`에서 서버 상태를 확인합니다. | 설정 파일의 `command`가 `bunx`, `args`가 `cursor-talk-to-figma-mcp@latest`인지 확인합니다. 수정 후 AI 클라이언트를 완전히 종료하고 다시 시작합니다. |
| `bunx` 또는 `bun` 명령을 찾지 못함 | 새 PowerShell에서 `bun --version`, `bunx --version`과 `Get-Command bunx`를 실행합니다. | Bun 설치와 PATH를 확인하고 터미널을 다시 엽니다. Windows 설정에 WSL 경로를 넣지 말고, 필요한 경우 같은 환경에 설치된 실행 파일의 전체 경로를 사용합니다. |
| Figma 플러그인이 채널을 표시하지 않음 | Talk To Figma MCP 저장소 폴더의 터미널에서 `bun socket`이 계속 실행 중인지 확인합니다. | 중단된 WebSocket 서버를 다시 실행한 뒤 Figma 플러그인을 닫았다가 다시 실행합니다. 그래도 안 되면 Figma의 개발 플러그인이 올바른 `manifest.json`을 가리키는지 확인합니다. |
| AI가 채널에 참가하지 못함 | 플러그인의 채널 ID와 프롬프트의 ID를 글자 단위로 비교합니다. 앞뒤 공백이나 이전 작업의 채널이 섞이지 않았는지 확인합니다. | 현재 채널 ID로 채널 참가를 다시 요청한 뒤 문서명, Page와 최상위 Frame 조회를 이어서 요청합니다. |
| AI가 다른 파일, Page 또는 Frame을 보고함 | Figma Desktop에서 현재 활성 파일과 Page를 확인합니다. | 모든 수정을 중단시키고 올바른 파일과 Page를 연 뒤 최상위 Frame을 다시 조회합니다. 대상이 일치하기 전에는 편집을 승인하지 않습니다. |
| `Node not found` 또는 비슷한 오류가 발생함 | 대상 노드의 부모 Frame이나 현재 선택 항목을 다시 조회해 최신 Node ID를 확인합니다. | 조회 결과로 반환된 ID를 사용합니다. 이름이나 이전 응답만 보고 ID를 추측하지 않습니다. |
| 큰 조회나 편집이 시간 초과됨 | Page 전체, 다수 Frame 또는 대량 노드를 한 번에 요청했는지 확인합니다. | 컴포넌트, 표, 모달 또는 Frame 단위로 요청을 나누고 조회와 수정을 순차 실행합니다. 실패한 대량 요청을 그대로 반복하지 않습니다. |
| 도구는 성공했지만 Figma 화면이 이전 상태로 보임 | 변경 대상의 노드 정보에서 텍스트, 위치와 크기가 바뀌었는지 조회합니다. | 노드 메타데이터를 확인하고 잠시 기다린 뒤 새로운 스크린샷을 요청합니다. 이전 스크린샷만 보고 같은 수정을 반복하지 않습니다. |
| 예상하지 않은 Frame이나 임시 요소가 남음 | 현재 Page의 최상위 자식과 작업 Frame의 자식 노드를 조회합니다. | 생성 경위와 ID가 확인된 임시 노드만 삭제합니다. 승인된 원본, 컴포넌트 원본과 검증되지 않은 대체 대상은 삭제하지 않습니다. |
| 기존 컴포넌트를 찾지 못해 AI가 새 UI를 만들려고 함 | 로컬 컴포넌트와 유사 업무 화면을 다시 조회했는지 확인합니다. | 새 컴포넌트 생성을 멈추고 사용할 수 있는 기존 대안, 필요한 변형과 현재 제약을 보고하게 합니다. |

권장 진단 순서는 다음과 같습니다.

```text
AI 클라이언트의 MCP 등록
→ MCP 도구 목록
→ bun socket 실행 상태
→ Figma 플러그인 실행 상태
→ 채널 ID
→ 문서명·Page·Frame
→ 대상 Node ID
```

문제를 보고할 때는 실제 개인정보를 제외하고 AI 클라이언트 이름과 버전, 운영체제, 실행한 명령, 오류 메시지, 채널 연결 여부와 실패 단계를 함께 기록합니다.

## 참고 자료

- [Talk To Figma MCP 공식 저장소](https://github.com/grab/cursor-talk-to-figma-mcp)
- [Codex MCP 공식 문서](https://developers.openai.com/codex/mcp/)
- [Cursor MCP 공식 문서](https://docs.cursor.com/context/model-context-protocol)
- [Claude Code MCP 공식 문서](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Bun 설치 안내](https://bun.sh/docs/installation)
- [AI 화면설계 지침](./AI_화면설계_지침_v0.1_260726.md)

작성 환경에서는 로컬 저장소의 패키지 버전 `0.3.5`를 확인했습니다. 실제로 `@latest`로 설치되는 버전은 다를 수 있습니다. Talk To Figma MCP 또는 AI 클라이언트를 업그레이드할 때는 패키지 이름, 등록 형식과 상태 확인 명령을 위 공식 문서에서 다시 확인하세요.

연결을 마친 뒤에는 [AI 화면설계 지침](./AI_화면설계_지침_v0.1_260726.md)을 새 작업의 첫 메시지에 적용하고 조사부터 시작하세요.
