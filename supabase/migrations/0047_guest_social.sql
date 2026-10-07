-- Loves and comments without an account.
--
-- People were asked to sign in before they could love or comment on a pick,
-- and some left instead. A visitor without an account now gets a private
-- per-browser id (an httpOnly cookie, stored here only as a salted SHA-256,
-- src/lib/ask/guest.ts) and can love, comment and reply under a nickname,
-- shown with a guest tag so no one can pass as a member.
--
-- Two steps. This one only adds (columns, the nickname trigger, a new
-- counts function beside the old one), so the live site keeps working.
-- 0048 changes the loves key and closes the tables to the browser, and runs
-- once the code that writes through the server is live.
--
-- Every read and write now goes through the server (api/social/*) with the
-- service role and an identity it has checked: the account from the session,
-- or the guest key from the cookie. So the tables close to the browser
-- entirely (no grants, no policies), which also keeps the guest keys private.

-- Loves: the guest column now; the key change that lets user_id be empty
-- is 0048, applied after the code that writes guest loves is live.
alter table public.pick_loves add column if not exists guest_key text check (char_length(guest_key) = 64);

-- Comments: same, plus a nickname for guests.
alter table public.pick_comments alter column user_id drop not null;
alter table public.pick_comments add column if not exists guest_key text check (char_length(guest_key) = 64);
-- Hashed network address of a guest comment, for the per-network rate limit.
alter table public.pick_comments add column if not exists guest_ip text check (char_length(guest_ip) = 64);
alter table public.pick_comments add constraint pick_comments_one_identity check ((user_id is null) <> (guest_key is null));
create index if not exists pick_comments_guest_idx on public.pick_comments (guest_key, created_at) where guest_key is not null;

-- Members' names still come from their profile, never the client; a guest's
-- nickname is checked by the API and trimmed here.
create or replace function public.pick_comment_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.author_name := left(coalesce(nullif(btrim(new.author_name), ''), 'Guest'), 24);
    return new;
  end if;
  select coalesce(nullif(btrim(p.display_name), ''), split_part(coalesce(p.email, ''), '@', 1), 'BetriX user')
    into new.author_name
    from public.profiles p
   where p.id = new.user_id;
  new.author_name := left(coalesce(nullif(new.author_name, ''), 'BetriX user'), 40);
  return new;
end;
$$;
revoke all on function public.pick_comment_author() from public, anon, authenticated;

-- Counts for a page of picks, with "loved" for whichever identity is asking.
create or replace function public.pick_social_counts(p_match_ids text[], p_user uuid, p_guest text)
returns table (match_id text, loves bigint, comments bigint, loved boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         (select count(*) from public.pick_loves l where l.match_id = m.id),
         (select count(*) from public.pick_comments c where c.match_id = m.id),
         exists (
           select 1 from public.pick_loves l
            where l.match_id = m.id
              and ((p_user is not null and l.user_id = p_user) or (p_guest is not null and l.guest_key = p_guest))
         )
    from unnest(p_match_ids) as m(id);
$$;
revoke all on function public.pick_social_counts(text[], uuid, text) from public, anon, authenticated;
grant execute on function public.pick_social_counts(text[], uuid, text) to service_role;
