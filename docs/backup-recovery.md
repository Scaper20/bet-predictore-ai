# Database backup and recovery

CTO review item 1.3 (4 Nov 2026). Production database: Supabase project `liciklbcvnkttukuydxi`
(eu-west-1, Postgres 17), in the **Betrix** organisation on the **Pro** plan.

## What protects the data

| Copy | Where | How often | Kept | Who restores |
| --- | --- | --- | --- | --- |
| Supabase daily backup | Supabase | Daily, automatic (Pro plan) | 7 days | Founder, from the dashboard |
| Off-site logical dump | GitHub Actions artifact, encrypted (AES-256, `BACKUP_PASSPHRASE`) | Weekly, Sundays 02:17 UTC (`.github/workflows/db-backup.yml`) | 8 days | Developer, with `pg_restore` |

Point-in-time recovery (restore to any minute) is a paid add-on and is **not** enabled. The worst
case today is losing up to a day of data from the Supabase backup, or a week from the off-site copy.

The earlier warning of "no managed backups" dates from the Free plan; the organisation is now on Pro.

## Setup still needed (founder)

1. Supabase dashboard → Database → Backups: confirm daily backups are listed, and screenshot it for the
   checklist.
2. GitHub → Settings → Secrets and variables → Actions → add:
   - `SUPABASE_DB_URL`: Supabase → Connect → **Session pooler** URI, with the database password filled in.
   - `BACKUP_PASSPHRASE`: a long random passphrase. Store it in the password manager as well; without
     it the off-site dumps cannot be opened.
3. GitHub → Actions → "Off-site database backup" → **Run workflow** once, and check that it finishes green
   and produces an artifact.

## Restore drill (do once now, then every quarter)

Never restore over production for a drill. Use a new, throwaway project.

**From a Supabase backup.** Dashboard → Database → Backups → choose a day → "Restore to a new project"
(if offered), or download it. Check that row counts match production for `profiles`, `subscriptions`,
`payments` and `passes`, then delete the throwaway project.

**From the off-site dump.**

```bash
gh run download <run-id> -n kiqstat-<stamp>.dump.gpg
gpg --decrypt --output kiqstat.dump kiqstat-<stamp>.dump.gpg   # asks for BACKUP_PASSPHRASE
pg_restore --list kiqstat.dump | head                           # the archive reads
pg_restore --no-owner --no-privileges --dbname "$THROWAWAY_DB_URL" kiqstat.dump
psql "$THROWAWAY_DB_URL" -c "select count(*) from public.payments"
```

Record the date, the copy used, the row counts and the time taken in the CTO review checklist.

## If production data is lost or damaged

1. Turn on maintenance mode in /admin so no new writes land on bad data.
2. Find the last good copy: the most recent Supabase daily backup before the damage.
3. Restore it in the dashboard. For a whole-database loss, restore in place. For damage to a few tables,
   restore to a new project and copy those tables back.
4. Payments taken since that backup: re-run them from Paystack and Flutterwave. The daily subscription
   check (`src/lib/paystack/subscription-check.ts`) re-records missed card renewals by itself.
   Pay-once and pass charges need a manual look in the Paystack dashboard.
5. Turn maintenance mode off, then write up what happened.
