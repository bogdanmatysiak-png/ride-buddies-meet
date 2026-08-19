# Plan: Fix notify_group_invite_accepted migration

## Goal
Create a new Supabase migration that records in the repository the manual fix already applied in the database for `public.notify_group_invite_accepted()`.

## Problem
The function previously had an `INSERT` mismatch:
- Target columns: `(user_id, group_id, title, body)` — 4 columns.
- `SELECT` expressions: only 3 values (`t`, title, body).
- Result: PostgreSQL error 42601 "INSERT has more target columns than expressions".

## Migration
File: `supabase/migrations/20260819175300_d91302a2-4c11-460e-85fa-eca438b1db66.sql`

Contains only `CREATE OR REPLACE FUNCTION public.notify_group_invite_accepted()` with the corrected `INSERT` that includes `NEW.group_id` as the second expression.

Preserves:
- `RETURNS trigger`
- `LANGUAGE plpgsql`
- `SECURITY DEFINER`
- `SET search_path TO 'public'`

Does **not** touch:
- Triggers
- RLS policies
- `EXECUTE` grants
- Other functions

## Verification after deployment
1. Accept a group invite and confirm the owner/inviter receives a notification.
2. Check that the PostgreSQL error 42601 no longer appears.
3. Confirm function source matches the migration.

## Deployment
Deploy via the Supabase migration tool after plan approval.
