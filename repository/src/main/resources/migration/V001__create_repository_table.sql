create table public.repository (
  id UUID primary key,
  owner_id UUID not null,
  name TEXT,
  structure JSON,
  permissions smallint not null default 70,
  created TIMESTAMP WITH TIME ZONE not null default now(),
  updated TIMESTAMP WITH TIME ZONE not null default now()
);
