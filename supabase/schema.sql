-- Run this once in the Supabase SQL Editor.
create table if not exists public.product_settings (
  id integer primary key check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.product_settings enable row level security;
grant select on public.product_settings to anon, authenticated;
drop policy if exists "Public can read product settings" on public.product_settings;
create policy "Public can read product settings"
  on public.product_settings for select to anon, authenticated using (true);

-- Writes use the server-only service role key after admin authentication.
revoke insert, update, delete on public.product_settings from anon, authenticated;

insert into public.product_settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Newsletter signups: public can submit a consented email, but cannot read the list.
create table if not exists public.newsletter_subscribers (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and length(email) <= 254),
  consent boolean not null default false check (consent = true),
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;
grant insert on public.newsletter_subscribers to anon;
revoke select, update, delete on public.newsletter_subscribers from anon, authenticated;
drop policy if exists "Visitors can subscribe to newsletter" on public.newsletter_subscribers;
create policy "Visitors can subscribe to newsletter"
  on public.newsletter_subscribers for insert to anon
  with check (consent = true and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
