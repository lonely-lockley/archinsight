alter table public.userdata
  ADD COLUMN ssr_session VARCHAR(50) NULL;
CREATE UNIQUE INDEX idx_ssr_session ON public.userdata (ssr_session);
