drop view if exists public.chart_metadata_active;
drop table if exists public.chart_snapshot_publications;

alter table if exists public.chart_metadata
  drop column if exists cpi_hc,
  drop column if exists cpi_ex;
