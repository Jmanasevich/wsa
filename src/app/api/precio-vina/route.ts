import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Precio US$/L de una viña por mercado (Aduana) vs benchmark del origen Chile y del mercado total (Comtrade).
const MAP: Record<string, string> = { 'U.S.A.': 'EE.UU.', 'Corea Del Sur': 'Corea del Sur' };
const cm = (m: string) => MAP[m] || m;
const ok = (p: any) => (p != null && Number(p) > 0.1 && Number(p) < 50 ? Number(p) : null);

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const vina = req.nextUrl.searchParams.get('vina') || '';
  if (!vina) return NextResponse.json({ error: 'vina requerida' }, { status: 400 });
  const [{ data: vrows }, { data: bench }] = await Promise.all([
    db().rpc('comparar_ventas', { p_dim: 'mercado', p_vina: vina, p_mercado: null, p_formato: null }),
    db().rpc('precio_benchmark'),
  ]);
  const B: Record<string, any> = {};
  for (const b of bench ?? []) B[b.mercado] = b;
  const filas = (vrows ?? []).map((r: any) => {
    const u = Number(r.valor_usd) || 0; const l = Number(r.volumen_l) || 0;
    const vp = l > 0 ? +(u / l).toFixed(2) : null;
    const b = B[cm(r.clave)];
    const chile = ok(b?.precio_chile_l); const mkt = ok(b?.precio_mercado_l);
    return {
      mercado: r.clave, vina_usd: Math.round(u), vina_precio_l: vp,
      chile_l: chile, mercado_l: mkt,
      gap_chile_pct: vp && chile ? +(100 * (vp - chile) / chile).toFixed(0) : null,
      gap_mercado_pct: vp && mkt ? +(100 * (vp - mkt) / mkt).toFixed(0) : null,
    };
  }).filter((f: any) => f.vina_precio_l != null).sort((a: any, b: any) => b.vina_usd - a.vina_usd);
  return NextResponse.json({ vina, filas, n: filas.length });
}
