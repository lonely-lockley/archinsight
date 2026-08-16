-- Run as the database owner after migrations. Create the LOGIN role and grant
-- CONNECT separately through deployment secret management; this file never
-- contains credentials and does not assume a database name.
revoke all on schema public from archinsight_playground;
revoke all on all tables in schema public from archinsight_playground;
grant usage on schema public to archinsight_playground;
grant select on public.playground_current_repository to archinsight_playground;
grant select on public.playground_current_file to archinsight_playground;
