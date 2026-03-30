# INFINITAS Table Maker Web

기존 `INFINITAS Table Maker`를 웹으로 옮긴 프로젝트입니다.

## 실행

```bash
npm install
npm run dev
```

- 기본 주소: `http://127.0.0.1:4173`

## 필요한 env

일반 실행과 배포에는 아래 공개 값이 필요합니다.

```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

관리자용 스크립트까지 쓸 때만 아래 값이 추가로 필요합니다.

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- 실제 값은 `.env.local` 등에 넣고, Git에는 올리지 않습니다.
- 예시는 [.env.example](d:/INFINITAS%20Table%20Maker/WEB_PROJECT/.env.example)에 있습니다.

## 배포

- GitHub + Vercel 기준으로 정리되어 있습니다.
- 간단한 배포 메모는 [docs/vercel-first-deploy.md](d:/INFINITAS%20Table%20Maker/WEB_PROJECT/docs/vercel-first-deploy.md)에 있습니다.
