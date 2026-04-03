# 🛠️ WinNAS 설치 및 설정 가이드

이 문서는 WinNAS를 처음부터 설치하고, Cloudflare Tunnel로 외부 접근을 설정하는 전체 과정을 다룹니다.

---

## 📋 사전 요구사항

| 항목 | 최소 버전 | 확인 명령어 |
|------|----------|------------|
| **Node.js** | 18.0 이상 | `node --version` |
| **npm** | 9.0 이상 | `npm --version` |
| **OS** | Windows 10/11 | - |

> ⚠️ Node.js가 없다면 [nodejs.org](https://nodejs.org/)에서 LTS 버전을 설치하세요.

---

## 1단계: 프로젝트 설치

```powershell
# 프로젝트 폴더로 이동
cd C:\path\to\winnas

# 의존성 설치
npm install
```

### PowerShell 실행 정책 오류 시
```powershell
# 이 오류가 나면:
# "이 시스템에서 스크립트를 실행할 수 없으므로..."
powershell -ExecutionPolicy Bypass -Command "npm install"
```

---

## 2단계: 초기 설정

```powershell
npm run setup
# 또는
node setup.js
```

### 설정 항목

#### 🔑 관리자 비밀번호
```
🔑 Set admin password (min 8 characters): ********
🔑 Confirm password: ********
```
- **최소 8자** 이상
- 영문 대소문자 + 숫자 + 특수문자 조합 권장
- 이 비밀번호는 bcrypt(12 rounds)로 해시되어 저장됩니다

#### 📁 드라이브 설정
```
📁 Configure allowed drives
   Enter drive letters separated by commas (e.g., D,E,F)
   Drives: D,E
```
- 외부에 노출할 드라이브 문자를 콤마로 구분
- **⚠️ C: 드라이브는 시스템 드라이브이므로 권장하지 않습니다**
- 예: `D,E` → D:\와 E:\만 접근 가능

### 설정 완료 후 생성되는 파일
- `config.json` — 서버 설정 (포트, JWT 시크릿, 드라이브 목록)
- `data/winnas.db` — SQLite 데이터베이스

---

## 3단계: 서버 시작

```powershell
npm start
# 또는
node server/index.js
```

성공하면 다음 메시지가 표시됩니다:
```
╔══════════════════════════════════════════════════════╗
║              WinNAS Server Running                   ║
║  🌐 Local:  http://localhost:7943                   ║
╚══════════════════════════════════════════════════════╝
```

로컬 확인: 브라우저에서 `http://localhost:7943` 접속

---

## 4단계: Cloudflare Tunnel로 외부 접근 설정

### 방법 A: Quick Tunnel (가장 간단, 테스트용)

```powershell
# cloudflared 설치 (최초 1회)
winget install Cloudflare.cloudflared

# Quick Tunnel 시작
cloudflared tunnel --url http://localhost:7943
```

출력에서 URL을 확인합니다:
```
Your quick Tunnel has been created!
Visit it at: https://random-words.trycloudflare.com
```

> ⚠️ Quick Tunnel의 URL은 서버 재시작 시 변경됩니다.

---

### 방법 B: Named Tunnel (고정 URL, 운영용 권장)

#### 1. Cloudflare 계정 로그인
```powershell
cloudflared tunnel login
# 브라우저가 열리면 Cloudflare 계정으로 로그인
```

#### 2. 터널 생성
```powershell
cloudflared tunnel create winnas
# → 터널 ID와 credentials 파일 경로가 출력됩니다
```

#### 3. DNS 레코드 추가
```powershell
# your-domain.com 에 연결 (Cloudflare DNS 관리 중인 도메인)
cloudflared tunnel route dns winnas nas.your-domain.com
```

#### 4. 설정 파일 생성

`~/.cloudflared/config.yml` 파일을 만듭니다:

```yaml
tunnel: <터널-ID>
credentials-file: C:\Users\<사용자>\.cloudflared\<터널-ID>.json

ingress:
  - hostname: nas.your-domain.com
    service: http://localhost:7943
  - service: http_status:404
```

#### 5. 터널 실행
```powershell
cloudflared tunnel run winnas
```

#### 6. (선택) Windows 서비스로 등록
```powershell
# 관리자 권한 PowerShell에서:
cloudflared service install
```
→ 시스템 시작 시 자동 실행됩니다.

---

## 5단계: 첫 접속 및 기기 등록

### 첫 번째 기기 (자동 승인)
1. 브라우저에서 Cloudflare 터널 URL 접속
2. 비밀번호 입력 → **자동으로 기기 승인**됨
3. 대시보드 진입

### 두 번째 기기 이후 (승인 필요)
1. 새 기기에서 접속 → 비밀번호 입력
2. "기기 승인 대기" 화면 표시
3. **이미 승인된 기기의 대시보드에서**:
   - 좌측 사이드바 → `기기 관리` 클릭
   - 또는 상단 알림(🔔) 아이콘 클릭
   - 대기 중인 기기를 **승인**
4. 새 기기에서 "다시 시도" 클릭 또는 새로고침

---

## ⚙️ 설정 커스터마이즈 (config.json)

```jsonc
{
  "server": {
    "port": 7943,              // 서버 포트 (변경 가능)
    "jwtSecret": "...",        // 자동 생성된 시크릿 키 (변경 금지)
    "sessionExpiry": "7d",     // 세션 만료: 7일 (1d, 12h 등 가능)
    "maxUploadSize": "500mb"   // 최대 업로드 크기
  },
  "drives": ["D:\\", "E:\\"],  // 접근 허용 드라이브
  "security": {
    "maxLoginAttempts": 3,     // 최대 로그인 시도 (이후 잠금)
    "lockoutMinutes": 30       // 잠금 시간 (분)
  }
}
```

### 드라이브 추가/제거
`config.json`의 `drives` 배열을 수정하고 서버를 재시작합니다:
```json
"drives": ["D:\\", "E:\\", "F:\\"]
```

---

## 🔧 관리 명령어

| 명령어 | 설명 |
|--------|------|
| `npm start` | 서버 시작 |
| `npm run setup` | 초기 설정 (재실행 시 비밀번호 재설정) |
| `node reset_devices.js` | 모든 기기 등록 초기화 |

### 비밀번호 변경
- **웹 UI**: 대시보드 → 설정(⚙️) → 비밀번호 변경 탭
- **CLI**: `npm run setup` 재실행

### 기기 관리
- **웹 UI**: 대시보드 → 기기 관리
  - 승인 / 차단 / 삭제 가능

---

## 🔒 보안 권장사항

### 필수
- [ ] C: 드라이브를 허용 드라이브에서 **제외**
- [ ] 비밀번호는 **12자 이상**, 영문+숫자+특수문자 조합
- [ ] Cloudflare Tunnel을 통해서만 외부 접근 (직접 포트 노출 금지)
- [ ] 사용하지 않는 기기는 즉시 **차단/삭제**

### 권장
- [ ] Named Tunnel + 커스텀 도메인 사용 (URL 고정)
- [ ] Cloudflare Access 정책 추가 (이중 인증)
- [ ] 방화벽에서 7943 포트 외부 접근 차단 (Cloudflare만 허용)
- [ ] 정기적으로 비밀번호 변경

---

## ❓ 문제 해결

### "npm install 실행 시 스크립트 오류"
```powershell
powershell -ExecutionPolicy Bypass -Command "npm install"
```

### "로그인 시 기기 승인 대기만 표시"
다른 기기에서 승인해야 합니다. 모든 기기가 잠겨 있다면:
```powershell
node reset_devices.js   # 모든 기기 초기화
# 서버 재시작 후 다시 로그인 → 첫 기기 자동 승인
```

### "서버 시작 시 'Admin not set up' 오류"
```powershell
npm run setup   # 초기 설정 다시 실행
```

### "Cloudflare Tunnel URL이 매번 바뀜"
Named Tunnel을 사용하세요 (위 방법 B 참고).

### "특정 폴더 접근 시 EPERM 오류"
Windows 시스템 보호 폴더(System32, Config.Msi 등)에 접근할 수 없습니다.
이는 정상 동작이며 해당 폴더를 건너뛰고 나머지를 표시합니다.
