import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const sp = req.nextUrl.searchParams;
  const dim = ['vina', 'mercado', 'formato', 'mundo'].includes(sp.get('dim') || '') ? (sp.get('dim') as string) : 'vina';

  if (dim === 'mundo') {
    try {
      let q = db().from('productores').select('pais,nombre,grupo,marcas,segmento,revenue_musd,fuente_rev');
      const fPais = sp.get('pais') || '';
      if (fPais) q = q.eq('pais', fPais);
      const { data, error } = await q.order('revenue_musd', { ascending: false, nullsFirst: false }).limit(200);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const filas = (data ?? []).map((d: any) => ({
        clave: d.nombre, pais: d.pais, grupo: d.grupo, marcas: d.marcas, segmento: d.segmento,
        revenue_musd: d.revenue_musd ? Math.round(Number(d.revenue_musd)) : null,
      }));
      const paises = Array.from(new Set((data ?? []).map((d: any) => d.pais))).sort();
      return NextResponse.json({ dim, filas, n: filas.length, mundo: true, paises });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
    }
  }

  try {
    const { data, error } = await db().rpc('comparar_ventas', {
      p_dim: dim,
      p_vina: sp.get('vina') || null,
      p_mercado: sp.get('mercado') || null,
      p_formato: sp.get('formato') || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const total = (data ?? []).reduce((s: number, r: any) => s + Number(r.valor_usd || 0), 0) || 1;
    const filas = (data ?? []).map((r: any) => {
      const u = Number(r.valor_usd) || 0, l = Number(r.volumen_l) || 0;
      return { clave: r.clave, valor_usd: Math.round(u), volumen_l: Math.round(l), precio_l: l ? +(u / l).toFixed(2) : null, share: +(100 * u / total).toFixed(1) };
    });
    return NextResponse.json({ dim, filas, total_usd: Math.round(total), periodo: '2025', n: filas.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  try {
    const { data, error } = await db().rpc('catalogos_ventas');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const vinas = (data ?? []).filter((r: any) => r.tipo === 'vina').map((r: any) => r.valor).sort();
    const mercados = (data ?? []).filter((r: any) => r.tipo === 'mercado').map((r: any) => r.valor).sort();
    return NextResponse.json({ vinas, mercados });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
