import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Ingesta de embarques por vina ya procesados (el ETL pesado corre fuera de Vercel; aqui solo upsert).
// Protegido por CRON_SECRET (header Authorization: Bearer <CRON_SECRET>).
export async function POST(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON invalido' }, { status: 400 }); }
  const filas = Array.isArray(body?.filas) ? body.filas : null;
  if (!filas?.length) return NextResponse.json({ error: 'filas[] requerido' }, { status: 400 });

  const limpias = filas
    .filter((f: any) => f?.periodo && f?.vina && f?.mercado && f?.formato)
    .map((f: any) => ({
      periodo: String(f.periodo).slice(0, 6), vina: String(f.vina).slice(0, 120),
      mercado: String(f.mercado).slice(0, 60), formato: String(f.formato).slice(0, 40),
      volumen_l: Number(f.volumen_l) || 0, valor_usd: Number(f.valor_usd) || 0,
    }));
  let cargadas = 0;
  for (let i = 0; i < limpias.length; i += 500) {
    const lote = limpias.slice(i, i + 500);
    const { error } = await db().from('embarques_vina').upsert(lote, { onConflict: 'periodo,vina,mercado,formato' });
    if (error) return NextResponse.json({ error: error.message, cargadas }, { status: 500 });
    cargadas += lote.length;
  }
  return NextResponse.json({ ok: true, cargadas });
}

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { data } = await db().from('embarques_vina').select('periodo').order('periodo', { ascending: false }).limit(1);
  const { count } = await db().from('embarques_vina').select('*', { count: 'exact', head: true });
  return NextResponse.json({ ultimo_periodo: data?.[0]?.periodo ?? null, filas: count ?? 0 });
}
