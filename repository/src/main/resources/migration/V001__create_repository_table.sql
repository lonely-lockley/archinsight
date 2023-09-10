create table public.repository (
  id UUID primary key,
  owner_id UUID not null,
  structure JSON,
  permissions integer not null,
  created TIMESTAMP WITH TIME ZONE not null default now(),
  updated TIMESTAMP WITH TIME ZONE not null default now()
);
