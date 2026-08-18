import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Competencia por país de origen en un mercado importador (Comtrade). El tablero mundial que Chile debe mirar.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const sp = req.nextUrl.searchParams;
  const mercado = sp.get('mercado') || '';

  if (!mercado) {
    const { data } = await db().from('mercado_origen').select('mercado');
    const mercados = Array.from(new Set((data ?? []).map((d: any) => d.mercado))).sort();
    return NextResponse.json({ mercados });
  }

  const { data, error } = await db().from('mercado_origen').select('origen,anio,valor_usd').eq('mercado', mercado);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];
  const anios = Array.from(new Set(rows.map((r: any) => r.anio))).sort((a: number, b: number) => b - a);
  const anio = anios[0];
  const prev = anios.find((y: number) => y < anio);
  const cur = rows.filter((r: any) => r.anio === anio);
  const total = cur.reduce((s: number, r: any) => s + Number(r.valor_usd || 0), 0) || 1;
  const prevMap: Record<string, number> = {};
  if (prev != null) for (const r of rows.filter((r: any) => r.anio === prev)) prevMap[r.origen] = Number(r.valor_usd || 0);
  const filas = cur.map((r: any) => {
    const u = Number(r.valor_usd || 0); const p = prevMap[r.origen];
    return { origen: r.origen, usd: Math.round(u), share: +(100 * u / total).toFixed(1), delta_pct: p ? +(100 * (u - p) / p).toFixed(1) : null };
  }).sort((a: any, b: any) => b.usd - a.usd);
  filas.forEach((f: any, i: number) => (f.rank = i + 1));
  const chile = filas.find((f: any) => /chile/i.test(f.origen)) || null;
  return NextResponse.json({ mercado, anio, anio_prev: prev ?? null, total_usd: Math.round(total), filas, chile });
}
