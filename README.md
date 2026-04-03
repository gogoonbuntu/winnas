<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-sql.js-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/Cloudflare_Tunnel-Supported-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
</p>

<h1 align="center">🗄️ WinNAS</h1>
<p align="center"><strong>Personal Cloud Storage for Windows</strong></p>
<p align="center">
  Windows PC의 드라이브를 어디서나 안전하게 접근하는 개인 NAS 서버.<br/>
  스마트폰, 태블릿, 다른 PC에서 파일을 탐색하고, 이미지와 영상을 스트리밍하고, 파일을 업로드/다운로드할 수 있습니다.
</p>

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 📁 **파일 탐색** | D:, E: 등 지정 드라이브의 폴더/파일을 웹 브라우저에서 탐색 |
| 🖼️ **이미지 미리보기** | JPG, PNG, GIF, WebP 등 이미지를 풀스크린 뷰어로 열람, 더블탭 줌 |
| 🎬 **영상 스트리밍** | MP4, WebM 영상을 Range 기반 스트리밍으로 재생 |
| ⬆️ **파일 업로드** | 드래그&드롭 또는 선택으로 다중 파일 업로드 (진행률 표시) |
| ⬇️ **파일 다운로드** | 개별 파일 원클릭 다운로드 |
| 🔐 **다중 보안** | 비밀번호 + 기기 핑거프린팅 + JWT 세션 + Rate Limiting |
| 📱 **기기 관리** | 기기 등록/승인/차단 시스템, 첫 기기 자동 승인 |
| 🌐 **외부 접근** | Cloudflare Tunnel을 통한 안전한 외부 접근 |
| 📱 **모바일 최적화** | 반응형 UI, 뒤로가기 버튼 지원, 터치 친화적 |

---

## 🏗️ 기술 스택

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: SQLite via [sql.js](https://github.com/sql-js/sql.js) (네이티브 빌드 불필요, 순수 JS)
- **Authentication**: bcryptjs (패스워드 해싱) + jsonwebtoken (JWT 세션)
- **Security**: helmet (보안 헤더), Rate Limiting (IP 기반 로그인 제한)
- **Upload**: multer (멀티파트 파일 업로드)

### Frontend
- **Framework**: Vanilla JavaScript (SPA) — 프레임워크 의존성 없음
- **Design**: 다크 모드 글래스모피즘 UI
- **Typography**: Google Fonts (Inter)
- **Icons**: 인라인 SVG

### Infrastructure
- **External Access**: Cloudflare Tunnel (Quick Tunnel 또는 Named Tunnel)
- **Protocol**: HTTP (Cloudflare가 HTTPS 종단 처리)
- **Port**: 7943 (커스텀)

---

## 📐 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                    Cloudflare Tunnel                      │
│              (HTTPS 종단, DDoS 보호)                      │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────────┐
│                  Express.js Server (:7943)                │
│  ┌──────────┐  ┌───────────┐  ┌─────────────────────┐   │
│  │  helmet   │  │ rate-limit │  │  auth middleware     │   │
│  │ (보안헤더) │  │ (접속제한)  │  │ (JWT + 기기 검증)    │   │
│  └──────────┘  └───────────┘  └─────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Routes                                              │ │
│  │  /api/auth/*     로그인, 로그아웃, 비밀번호 변경      │ │
│  │  /api/files/*    탐색, 다운로드, 업로드, 검색         │ │
│  │  /api/media/*    썸네일, 이미지, 영상 스트리밍        │ │
│  │  /api/devices/*  기기 승인, 차단, 삭제               │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────────┐  ┌────────────────────────────────┐   │
│  │ sql.js (DB)  │  │ Static Files (public/)          │   │
│  │  - users     │  │  - login.html                   │   │
│  │  - devices   │  │  - index.html (SPA Dashboard)   │   │
│  │  - sessions  │  │  - css/style.css                │   │
│  │  - attempts  │  │  - js/app.js, fileManager.js    │   │
│  └──────────────┘  │  - js/mediaViewer.js, login.js  │   │
│                     └────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 🔒 보안 체계

```
사용자 접속
    │
    ▼
[1] Rate Limiting ── 15분 내 5회 실패 → IP 차단
    │
    ▼
[2] 비밀번호 검증 ── bcrypt (salt 12 rounds) 해시 비교
    │
    ▼
[3] 기기 핑거프린팅 ── 화면, 브라우저, Canvas, WebGL 조합 해시
    │
    ├─ 첫 번째 기기 → 자동 승인
    └─ 이후 기기 → "승인 대기" → 기존 기기에서 승인 필요
    │
    ▼
[4] JWT 세션 ── 7일 만료, 토큰 해시를 DB에 저장하여 강제 만료 가능
    │
    ▼
[5] 경로 보안 ── Path Traversal 차단, 허용 드라이브 범위만 접근
```

---

## 📂 프로젝트 구조

```
winnas/
├── server/                  # 백엔드
│   ├── index.js             # Express 서버 진입점
│   ├── config.js            # 설정 로더
│   ├── db.js                # sql.js 데이터베이스
│   ├── middleware/
│   │   ├── auth.js          # JWT + 기기 인증
│   │   ├── device.js        # 기기 핑거프린트 체크
│   │   └── rateLimit.js     # 로그인 시도 제한
│   └── routes/
│       ├── auth.js          # 인증 API
│       ├── devices.js       # 기기 관리 API
│       ├── files.js         # 파일 탐색/업로드/다운로드
│       └── media.js         # 이미지/영상 스트리밍
├── public/                  # 프론트엔드
│   ├── index.html           # 메인 대시보드 (SPA)
│   ├── login.html           # 로그인 페이지
│   ├── css/style.css        # 다크 모드 글래스모피즘 스타일
│   └── js/
│       ├── app.js           # 메인 앱 로직
│       ├── fileManager.js   # 파일 탐색/렌더링
│       ├── mediaViewer.js   # 미디어 뷰어
│       └── login.js         # 로그인 로직
├── data/                    # DB 파일 (자동 생성)
├── config.json              # 서버 설정 (setup으로 생성)
├── setup.js                 # 초기 설정 스크립트
└── package.json
```

---

## 🚀 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 초기 설정 (비밀번호, 드라이브 구성)
npm run setup

# 3. 서버 시작
npm start
# → http://localhost:7943

# 4. (선택) 외부 접근 - Cloudflare Tunnel
cloudflared tunnel --url http://localhost:7943
```

> 📖 자세한 설치 가이드는 [SETUP.md](./SETUP.md)를 참고하세요.

---

## 📄 라이선스

MIT License
