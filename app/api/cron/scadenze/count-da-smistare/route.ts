import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  
  // Conta quante scadenze non hanno un cantiere assegnato e non sono pagate
  const { count, error } = await supabase
    .from('scadenze_pagamento')
    .select('*', { count: 'exact', head: true })
    .is('cantiere_id', null)
    .neq('stato', 'pagato');

  if (error) {
    return NextResponse.json({ count: 0 });
  }

  return NextResponse.json({ count });
}