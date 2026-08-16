import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const TIPOS = ['exportaciones', 'sell_out', 'precios', 'informe_pagado', 'benchmark', 'nota'];

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const { data, error } = await db().from('conocimiento')
    .select('id,created_at,tipo,titulo,mercado,cepa,fuente,fecha_dato,activo')
    .order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const titulo = String(body?.titulo ?? '').trim().slice(0, 200);
  const contenido = String(body?.contenido ?? '').trim().slice(0, 100000);
  if (!titulo || !contenido) return NextResponse.json({ error: 'Título y contenido son obligatorios' }, { status: 400 });
  const fila = {
    titulo, contenido,
    tipo: TIPOS.includes(body?.tipo) ? body.tipo : 'nota',
    mercado: body?.mercado ? String(body.mercado).slice(0, 60) : null,
    cepa: body?.cepa ? String(body.cepa).slice(0, 60) : null,
    fuente: body?.fuente ? String(body.fuente).slice(0, 200) : null,
    fecha_dato: body?.fecha_dato || null,
  };
  const { data, error } = await db().from('conocimiento').insert(fila).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!body?.id || typeof body?.activo !== 'boolean') return NextResponse.json({ error: 'id/activo requeridos' }, { status: 400 });
  const { error } = await db().from('conocimiento').update({ activo: body.activo }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
