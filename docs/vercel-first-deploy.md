# Vercel First Deploy

## 1. GitHub 준비

1. `WEB_PROJECT` 폴더만 별도 GitHub 레포로 만듭니다.
2. `.env`, `.env.local`, `runtime-config.js`는 커밋하지 않습니다.
3. `.env.example`만 함께 올립니다.

## 2. Vercel Import

1. Vercel에서 GitHub 레포를 Import 합니다.
2. Framework Preset은 자동 감지가 애매하면 `Other`로 둡니다.
3. Build Command는 `npm run build`로 설정합니다.
4. Output Directory는 루트 `.` 기준 정적 파일 배포로 사용합니다.

## 3. Vercel Environment Variables

Vercel 프로젝트 설정에 아래 값을 넣습니다.

```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

- `PUBLIC_*`는 브라우저 공개용 값입니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 Vercel에 넣을 필요가 없습니다.
- 관리자 스크립트는 로컬에서만 실행하는 편이 안전합니다.

## 4. 첫 배포 후 확인

1. `runtime-config.js`가 배포 결과에 포함되는지 확인
2. Google 로그인 팝업과 redirect가 정상 동작하는지 확인
3. `assets/data/app-snapshot.json`이 최신인지 확인
4. 게스트 사용, 로그인, 회원가입, 소셜 접근 제한을 다시 확인

## 5. Supabase / OAuth

- Supabase Auth `Site URL`에 production URL 추가
- Redirect URL에 아래 항목 추가
  - localhost URL
  - production URL
  - preview URL이 필요하면 추가
- Google OAuth 콘솔에도 Supabase callback URL 반영

## 6. 이 프로젝트 기준 메모

- `server.js`는 로컬 개발 서버입니다.
- 실제 공개 배포는 Vercel 정적 호스팅 기준으로 맞추는 편이 안전합니다.
- `vercel.json`에서 기본 보안 헤더와 snapshot/runtime 캐시 정책을 관리합니다.

## 공식 문서

- Vercel Git Deploys: https://vercel.com/docs/git
- Vercel Domains: https://vercel.com/docs/domains/working-with-domains/add-a-domain
- Supabase Custom Domains: https://supabase.com/docs/guides/platform/custom-domains
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
