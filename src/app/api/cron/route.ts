import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Vigilancia diaria de ventanas: marca vencidas y deja alerta de cierres ≤30 días.
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const hoy = new Date();
  const hoyISO = hoy.toISOString().slice(0, 10);
  const en30 = new Date(hoy.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  await db().from('ventanas').update({ estado: 'vencida' }).eq('estado', 'abierta').lt('fecha_cierre', hoyISO);

  const { data: proximas } = await db().from('ventanas')
    .select('id,entidad,mercado,descripcion,fecha_cierre,url')
    .eq('estado', 'abierta').gte('fecha_cierre', hoyISO).lte('fecha_cierre', en30)
    .order('fecha_cierre', { ascending: true });

  for (const v of proximas ?? []) {
    const desc = `ALERTA ventana: ${v.entidad} (${v.mercado ?? '-'}) cierra ${v.fecha_cierre} — ${v.descripcion ?? ''}`;
    const { data: existe } = await db().from('senales').select('id').eq('descripcion', desc).limit(1);
    if (!existe?.length) {
      await db().from('senales').insert({ tipo: 'canal', descripcion: desc, mercado: v.mercado, fuente: v.url, fecha_dato: hoyISO });
    }
  }
  return NextResponse.json({ ok: true, hoy: hoyISO, ventanas_por_cerrar: proximas?.length ?? 0 });
}
