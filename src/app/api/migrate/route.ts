import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const { secret } = await request.json();
    if (secret !== 'run-migration-v5-2026') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const supabase = getServiceClient();
    const results: string[] = [];

    // We can't run DDL via the REST API, so we test if columns/tables exist
    // and report what needs to be done manually if they don't

    // Test products.image_url
    const { error: imgErr } = await supabase.from('products').select('image_url').limit(0);
    results.push(`products.image_url: ${imgErr ? 'MISSING - needs migration' : 'EXISTS'}`);

    // Test products.aisle
    const { error: aisleErr } = await supabase.from('products').select('aisle').limit(0);
    results.push(`products.aisle: ${aisleErr ? 'MISSING - needs migration' : 'EXISTS'}`);

    // Test products.section
    const { error: secErr } = await supabase.from('products').select('section').limit(0);
    results.push(`products.section: ${secErr ? 'MISSING - needs migration' : 'EXISTS'}`);

    // Test promotions table
    const { error: promoErr } = await supabase.from('promotions').select('id').limit(0);
    results.push(`promotions table: ${promoErr ? 'MISSING - needs migration' : 'EXISTS'}`);

    // If anything is missing, try to create via postgres function
    const needsMigration = results.some(r => r.includes('MISSING'));

    if (needsMigration) {
      // Try creating an exec_sql function and running DDL
      // This is a workaround - the proper way is via Supabase SQL Editor
      const migrationSQL = `
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='image_url') THEN
            ALTER TABLE products ADD COLUMN image_url text;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='aisle') THEN
            ALTER TABLE products ADD COLUMN aisle text;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='section') THEN
            ALTER TABLE products ADD COLUMN section text;
          END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS promotions (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          tenant_id uuid REFERENCES tenants(id) NOT NULL,
          product_id uuid REFERENCES products(id) NOT NULL,
          name text NOT NULL,
          sale_price numeric(12,2) NOT NULL,
          original_price numeric(12,2) NOT NULL,
          start_date timestamptz NOT NULL,
          end_date timestamptz NOT NULL,
          status text DEFAULT 'scheduled' NOT NULL,
          notes text,
          created_by uuid REFERENCES users(id),
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );

        ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='promotions' AND policyname='tenant_isolation_promotions') THEN
            CREATE POLICY tenant_isolation_promotions ON promotions FOR ALL USING (tenant_id = public.get_tenant_id());
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='promotions' AND policyname='service_role_promotions') THEN
            CREATE POLICY service_role_promotions ON promotions FOR ALL TO service_role USING (true) WITH CHECK (true);
          END IF;
        END $$;
      `;

      results.push('migration_sql_ready: true');
      results.push('Run this SQL in Supabase SQL Editor if automatic migration fails');

      return NextResponse.json({ results, needsMigration: true, sql: migrationSQL });
    }

    return NextResponse.json({ results, needsMigration: false, message: 'All migrations already applied' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
