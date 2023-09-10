create table public.file (
  id UUID primary key,
  owner_id UUID not null,
  repository_id UUID not null,
  file_name VARCHAR(100) not null,
  content TEXT,
  level VARCHAR(50),
  project_identifier VARCHAR(50),
  created TIMESTAMP WITH TIME ZONE not null default now(),
  updated TIMESTAMP WITH TIME ZONE not null default now()
);