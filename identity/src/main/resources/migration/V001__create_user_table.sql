create table public.userdata (
  id UUID primary key,
  origin_id VARCHAR(50),
  email VARCHAR(100) not null,
  email_verified BOOLEAN,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  display_name VARCHAR(100) not null,
  avatar TEXT,
  source VARCHAR(50) not null,
  locale VARCHAR(10),
  created TIMESTAMP WITH TIME ZONE not null default now()
);
CREATE UNIQUE INDEX userdata_email_ind ON public.userdata (email);
