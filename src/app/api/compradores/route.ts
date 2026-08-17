import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TIPOS = ['importador', 'distribuidor', 'retailer', 'monopolio', 'on_trade', 'agente'];

// Compradores reales por mercado (importadores/distribuidores/retail) — contraparte para el outreach.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const sp = req.nextUrl.searchParams;
  let q = db().from('compradores')
    .select('id,mercado,nombre,tipo,portafolio,canal,nota,url,activo')
    .eq('activo', true);
  const mercado = sp.get('mercado');
  if (mercado) q = q.ilike('mercado', `%${mercado}%`);
  const { data, error } = await q.order('mercado', { ascending: true }).order('nombre', { ascending: true }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const mercados = Array.from(new Set((data ?? []).map((d: any) => d.mercado))).sort();
  return NextResponse.json({ items: data ?? [], mercados, n: (data ?? []).length });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const mercado = String(body?.mercado ?? '').trim().slice(0, 60);
  const nombre = String(body?.nombre ?? '').trim().slice(0, 160);
  if (!mercado || !nombre) return NextResponse.json({ error: 'Mercado y nombre son obligatorios' }, { status: 400 });
  const fila = {
    mercado, nombre,
    tipo: TIPOS.includes(body?.tipo) ? body.tipo : 'importador',
    portafolio: body?.portafolio ? String(body.portafolio).slice(0, 400) : null,
    canal: body?.canal ? String(body.canal).slice(0, 120) : null,
    nota: body?.nota ? String(body.nota).slice(0, 500) : null,
    url: body?.url ? String(body.url).slice(0, 300) : null,
  };
  const { error } = await db().from('compradores').upsert(fila, { onConflict: 'mercado,nombre' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!body?.id || typeof body?.activo !== 'boolean') return NextResponse.json({ error: 'id/activo requeridos' }, { status: 400 });
  const { error } = await db().from('compradores').update({ activo: body.activo }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
