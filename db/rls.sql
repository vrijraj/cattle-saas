-- Defense-in-depth PostgreSQL Row-Level Security (RLS) policies.
-- Apply to production PostgreSQL 16+ with:
--   psql "$DATABASE_URL" -f db/rls.sql
-- Application connections using a non-superuser role must execute:
--   SET LOCAL app.current_farm_id = '<farm_id>';
-- inside each tenant transaction (or leave unset for platform/public queries via a dedicated bypass role).

DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'animal', 'breed', 'location', 'code_counter', 'alert', 'milk_yield',
    'bull', 'semen_batch', 'straw', 'heat', 'insemination', 'pregnancy_check',
    'dry_off', 'location_move', 'calving', 'health_event', 'vaccination',
    'deworming', 'weight', 'feed_item', 'feed_movement', 'finance_entry',
    'embryo', 'embryo_transfer', 'listing', 'enquiry', 'product', 'order',
    'audit_log', 'milk_price_history', 'vaccine_protocol', 'medicine_item',
    'medicine_movement', 'ration_group', 'ration_group_item', 'ai_session',
    'cron_run', 'invite'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (current_setting(''app.current_farm_id'', true) IS NULL OR current_setting(''app.current_farm_id'', true) = '''' OR farm_id = current_setting(''app.current_farm_id'', true)) WITH CHECK (current_setting(''app.current_farm_id'', true) IS NULL OR current_setting(''app.current_farm_id'', true) = '''' OR farm_id = current_setting(''app.current_farm_id'', true))',
      tbl
    );
  END LOOP;
END $$;
