import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Comparador de ventas directo sobre embarques_vina (Aduana). Sin LLM: instantaneo.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const sp = req.nextUrl.searchParams;
  const dim = (['vina', 'mercado', 'formato'].includes(sp.get('dim') || '') ? sp.get('dim') : 'vina') as 'vina' | 'mercado' | 'formato';
  const fVina = sp.get('vina') || '';
  const fMercado = sp.get('mercado') || '';
  const fFormato = sp.get('formato') || '';

  try {
    let q = db().from('embarques_vina').select('vina,mercado,formato,volumen_l,valor_usd');
    if (fVina) q = q.eq('vina', fVina);
    if (fMercado) q = q.eq('mercado', fMercado);
    if (fFormato) q = q.eq('formato', fFormato);
    const { data, error } = await q.limit(20000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const agg: Record<string, { u: number; l: number }> = {};
    for (const r of data ?? []) {
      const k = String((r as any)[dim]);
      const a = (agg[k] ??= { u: 0, l: 0 });
      a.u += Number(r.valor_usd) || 0; a.l += Number(r.volumen_l) || 0;
    }
    const total = Object.values(agg).reduce((s, x) => s + x.u, 0) || 1;
    const filas = Object.entries(agg)
      .map(([k, x]) => ({
        clave: k, valor_usd: Math.round(x.u), volumen_l: Math.round(x.l),
        precio_l: x.l ? +(x.u / x.l).toFixed(2) : null, share: +(100 * x.u / total).toFixed(1),
      }))
      .sort((a, b) => b.valor_usd - a.valor_usd);

    const vinas = Array.from(new Set((data ?? []).map(r => r.vina))).sort();
    return NextResponse.json({ dim, filas, total_usd: Math.round(total), periodo: '2025', n: filas.length, vinas });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  try {
    const { data } = await db().from('embarques_vina').select('vina,mercado').limit(20000);
    const vinas = Array.from(new Set((data ?? []).map(r => r.vina))).sort();
    const mercados = Array.from(new Set((data ?? []).map(r => r.mercado))).sort();
    return NextResponse.json({ vinas, mercados });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
