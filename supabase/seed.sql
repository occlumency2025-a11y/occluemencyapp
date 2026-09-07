-- Example providers, so the app has something to show on day one.
-- Replace these with the real people you sign in weeks 3–4, then delete this file.
--
-- Run in the Supabase SQL editor, or:  psql "$DATABASE_URL" -f supabase/seed.sql

insert into public.providers
  (name, category, city, headline, bio, session_fee, languages, status, contact_phone, recruited_via)
values
  (
    'Dr Anita Rao', 'counsellor', 'Bengaluru',
    'Anxiety, burnout and work stress',
    E'Twelve years in practice. I work mostly with people in their twenties and thirties who are managing pressure at work.\n\nSessions are 50 minutes, online or in Koramangala.',
    900, array['English', 'Kannada'], 'pilot', '+91 90000 00001', 'example seed'
  ),
  (
    'Ravi Kulkarni', 'yoga', 'Bengaluru',
    'Breath work for sleep and focus',
    E'Morning sessions in Indiranagar, or online. No prior experience needed.',
    600, array['English', 'Hindi', 'Kannada'], 'pilot', '+91 90000 00002', 'example seed'
  ),
  (
    'Meera Iyer', 'meditation', 'Bengaluru',
    'Guided practice for beginners',
    E'Short guided sessions, 25 minutes. Good if you have tried an app and it did not stick.',
    500, array['English', 'Tamil'], 'pilot', '+91 90000 00003', 'example seed'
  )
on conflict do nothing;
