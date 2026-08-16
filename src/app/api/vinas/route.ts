import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const { data, error } = await db().from('vinas')
    .select('id,nombre,perfil')
    .eq('activo', true).eq('pais', 'Chile')
    .order('nombre', { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const nombre = String(body?.nombre ?? '').trim().slice(0, 120);
  if (!nombre) return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 });
  const perfil = ['A', 'B', 'C'].includes(body?.perfil) ? body.perfil : 'B';
  const { error } = await db().from('vinas').insert({ nombre, perfil });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
