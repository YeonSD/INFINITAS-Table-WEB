# Web Launch Checklist

## Recommended first rollout

- Deploy the SPA as a static site on a managed host.
- Use Vercel first for the initial public rollout.
- Keep Supabase as the auth/database backend.
- Do not expose the current local `server.js` directly to the internet.

## Why this path

- This project is already a static SPA with client-side Supabase usage.
- Vercel gives fast Git-based production deploys and preview URLs.
- HTTPS and domain attachment are straightforward for first-user feedback rollout.

## Required auth setup before opening

### Supabase Auth URL configuration

- Set the production `SITE_URL` to the public domain.
- Add localhost redirect URL for local development.
- Add Vercel preview URL pattern for preview deploy testing.

### Google OAuth console

- Keep the current Supabase project callback URL registered.
- If Supabase custom auth domain is enabled later, add that callback URL too.

## Security checks before first public users

- Verify there is no service-role key anywhere in client code.
- Re-check Row Level Security on all user-facing tables and RPCs.
- Confirm users can only read/write their own account state unless a follow/share rule explicitly allows it.
- Re-test Google OAuth redirect flow on production domain.
- Re-test guest mode so guest users cannot reach history, social, bingo, or settings.
- Re-test signup flow for:
  - new account
  - existing account
  - logout after signup attempt
- Re-test account withdrawal from settings.

## Nice to do after first rollout

- Add a custom domain for Supabase Auth branding.
- Add separate production environment variables and deployment notes.
- Add a small rollback checklist for failed deploys.
