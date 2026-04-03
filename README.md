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

## 관리자 배포 버튼

관리자 계정은 설정 > 일반 탭에서 `변경사항 배포` 버튼을 사용할 수 있습니다.

동작 방식:
- DB의 `chart_metadata` 변경은 즉시 저장
- `변경사항 배포` 버튼이 Supabase Edge Function을 호출
- Edge Function이 GitHub Actions `publish-snapshot.yml`을 실행
- GitHub Actions가 `assets/data/app-snapshot.json`, `assets/data/snapshot-version.json`을 다시 만들고 `main`에 푸시
- Vercel이 해당 푸시를 감지해 자동 재배포

추가 설정이 필요합니다.

GitHub Repository Secrets:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Supabase Edge Function Secrets:

```bash
GITHUB_TRIGGER_TOKEN=github_fine_grained_pat_or_actions_dispatch_token
GITHUB_REPOSITORY=YeonSD/INFINITAS-Table-WEB
GITHUB_WORKFLOW_FILE=publish-snapshot.yml
GITHUB_WORKFLOW_REF=main
```

## 배포

- GitHub + Vercel 기준으로 정리되어 있습니다.
- 간단한 배포 메모는 [docs/vercel-first-deploy.md](d:/INFINITAS%20Table%20Maker/WEB_PROJECT/docs/vercel-first-deploy.md)에 있습니다.
