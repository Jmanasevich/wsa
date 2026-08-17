import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Crecimiento YTD 2025 vs 2026 (mismo periodo ene..p_max_mes) por viña o por mercado.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const sp = req.nextUrl.searchParams;
  const dim = ['vina', 'mercado'].includes(sp.get('dim') || '') ? (sp.get('dim') as string) : 'vina';
  const maxMes = /^(0[1-9]|1[0-2])$/.test(sp.get('max') || '') ? (sp.get('max') as string) : '06';
  const vina = sp.get('vina') || null;
  const { data, error } = await db().rpc('crecimiento_ytd', { p_dim: dim, p_max_mes: maxMes, p_vina: vina });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filas = (data ?? []).map((r: any) => ({
    clave: r.clave,
    usd_2025: Math.round(Number(r.fob_2025) || 0),
    usd_2026: Math.round(Number(r.fob_2026) || 0),
    delta_pct: r.delta_pct == null ? null : Number(r.delta_pct),
  }));
  const t25 = filas.reduce((s: number, f: any) => s + f.usd_2025, 0);
  const t26 = filas.reduce((s: number, f: any) => s + f.usd_2026, 0);
  const total = { usd_2025: t25, usd_2026: t26, delta_pct: t25 > 0 ? +(100 * (t26 - t25) / t25).toFixed(1) : null };
  return NextResponse.json({ dim, maxMes, filas, total, n: filas.length });
}
