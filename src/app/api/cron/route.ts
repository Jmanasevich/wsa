import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// --- Refresco mensual de embarques (UN Comtrade, gratis) ---
const SOCIOS = '842,826,76,156,392,410,124,484,528,372,276,752,578,246,208,251,724,170,604,218,188,600,643,704,764,702,36,554,56,757,616,344,32,591,320,214,158';

async function refrescarEmbarques(): Promise<{ periodo: string; estado: string }> {
  for (const atras of [3, 4, 5]) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - atras);
    const periodo = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const { data: ya } = await db().from('embarques').select('id').eq('periodo', periodo).limit(1);
    if (ya?.length) return { periodo, estado: 'ya cargado' };
    const url = `https://comtradeapi.un.org/public/v1/preview/C/M/HS?reporterCode=152&cmdCode=220410,220421,220422,220429&flowCode=X&period=${periodo}&partnerCode=${SOCIOS}&partner2Code=0&motCode=0&customsCode=C00&includeDesc=true`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return { periodo, estado: `comtrade ${r.status}` };
    const filas = (await r.json())?.data ?? [];
    if (!filas.length) continue; // mes aún no publicado; probar uno más atrás
    const agg: Record<string, any> = {};
    for (const x of filas) {
      const mercado = String(x.partnerDesc ?? x.partnerCode ?? '?').slice(0, 60);
      const key = `${x.period}|${x.cmdCode}|${mercado}`;
      const a = (agg[key] ??= { periodo: String(x.period), freq: 'M', partida: String(x.cmdCode), mercado, volumen_l: 0, valor_usd: 0 });
      a.volumen_l += Number(x.qty ?? x.netWgt ?? 0);
      a.valor_usd += Number(x.primaryValue ?? 0);
    }
    const rows = Object.values(agg).filter((a: any) => a.valor_usd > 0 || a.volumen_l > 0);
    if (rows.length) {
      const { error } = await db().from('embarques').upsert(rows, { onConflict: 'periodo,partida,mercado' });
      if (error) return { periodo, estado: `error: ${error.message}` };
      return { periodo, estado: `cargadas ${rows.length} filas` };
    }
  }
  return { periodo: '-', estado: 'sin meses nuevos publicados' };
}

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
  let embarques: { periodo: string; estado: string };
  try { embarques = await refrescarEmbarques(); } catch (e: any) { embarques = { periodo: '-', estado: e?.message ?? 'error' }; }

  return NextResponse.json({ ok: true, hoy: hoyISO, ventanas_por_cerrar: proximas?.length ?? 0, embarques });
}
