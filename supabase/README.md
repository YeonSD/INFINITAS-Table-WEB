# Supabase Metadata Workflow

`chart_metadata` is the source of truth for song metadata.

## Tables

- `chart_metadata`
  - admin-maintained per-chart metadata
  - category, radar values, notes, BPM, sort order

## Local bootstrap

1. `supabase/source/*.source.*`
   - raw local source copied from the current project state
2. `npm run snapshot:seed`
   - builds `supabase/seeds/chart_metadata.seed.json`
   - generates `assets/data/app-snapshot.json`

## Production workflow

1. Admin edits rows in `chart_metadata`
2. Run:

```bash
npm run snapshot:supabase
```

3. Deploy updated `assets/data/app-snapshot.json` and `assets/data/snapshot-version.json`

The web client only reads the published snapshot files.

## Seed import

To push the local seed into Supabase:

```bash
npm run seed:supabase
```

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

This performs batched upserts into `chart_metadata` using `chart_key` as the conflict key.
