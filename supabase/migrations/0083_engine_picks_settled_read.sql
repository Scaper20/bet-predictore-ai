-- 0083: The "More predictions" record is public, like predictions_log's.
--
-- engine_picks (0082) holds the group picks a free viewer sees one of per
-- game, the rest being Pro before kick-off. Once a pick is graded it is part
-- of the public track record, so anyone may read settled rows; an unsettled
-- row (a pick before or during its game) stays service role only.

create policy engine_picks_select_settled on public.engine_picks
  for select to anon, authenticated
  using (settled_at is not null);

grant select on public.engine_picks to anon, authenticated;
