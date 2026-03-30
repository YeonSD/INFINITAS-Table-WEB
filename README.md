# INFINITAS Table Maker Web

기존 `INFINITAS Table Maker` 데스크톱 앱을 웹 구조로 이식한 프로젝트입니다.

## Version

`1.0.0`

## 현재 방향

- 서열표는 비로그인 상태에서도 사용 가능
- 히스토리, 빙고, 소셜, 설정은 로그인 후 사용
- 웹 계정은 Google 로그인 기반
- 클라이언트는 `assets/data/app-snapshot.json`, `assets/data/snapshot-version.json`만 읽음
- 공개용 Supabase 설정은 런타임 생성 파일 `runtime-config.js`로 주입

## Local Run

```bash
npm install
npm run dev
```

- 기본 주소: `http://127.0.0.1:4173`
- `npm run dev` 전에 `.env.example`을 참고해서 `.env.local` 또는 `.env`를 만들어야 합니다.

## Scripts

```bash
npm run dev
npm run build
npm run snapshot:seed
npm run snapshot:supabase
npm run seed:supabase
```

- `build`
  - seed snapshot 생성 후 `runtime-config.js` 생성
- `snapshot:seed`
  - 로컬 seed 기준으로 snapshot 생성
- `snapshot:supabase`
  - Supabase `chart_metadata` 기준으로 snapshot 생성
- `seed:supabase`
  - 로컬 seed를 Supabase에 반영

## Environment Variables

브라우저 공개용 값과 관리자용 값을 분리합니다.

```bash
# Public browser config
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

# Private build/admin scripts
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- `PUBLIC_*` 값은 브라우저에 노출되는 공개 설정입니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 절대 Git에 커밋하면 안 됩니다.
- `runtime-config.js`는 빌드 시 생성되며 Git에 커밋하지 않습니다.

## Deploy

- GitHub 레포를 Vercel에 연결하는 정적 배포 기준으로 정리되어 있습니다.
- 배포 전 체크리스트: [docs/web-launch-checklist.md](./docs/web-launch-checklist.md)
- 첫 배포 절차: [docs/vercel-first-deploy.md](./docs/vercel-first-deploy.md)

## 주요 파일

- `app.js`
  - 상태, 인증, snapshot, 공용 동작
- `lib/ui.js`
  - 공용 렌더/바인딩
- `lib/*-ui.js`
  - 기능별 패널 렌더
- `lib/*-controller.js`
  - 빙고/소셜 동작 제어
- `scripts/generate-runtime-config.mjs`
  - 공개 env를 `runtime-config.js`로 생성
- `vercel.json`
  - 보안 헤더와 캐시 정책
