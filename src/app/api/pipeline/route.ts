import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const [ops, vens, sens] = await Promise.all([
      db().from('oportunidades').select('*').order('created_at', { ascending: false }).limit(50),
      db().from('ventanas').select('*').eq('estado', 'abierta').order('fecha_cierre', { ascending: true }).limit(25),
      db().from('senales').select('*').eq('estado', 'incubacion').order('created_at', { ascending: false }).limit(25),
    ]);
    return NextResponse.json({ hoy, oportunidades: ops.data ?? [], ventanas: vens.data ?? [], senales: sens.data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error de base de datos' }, { status: 500 });
  }
}

const ESTADOS_OP = ['nueva', 'validada', 'en_piloto', 'ejecutada', 'archivada'];

export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const { tabla, id, estado, causa_muerte } = body ?? {};
  if (!id || !['oportunidades', 'ventanas', 'senales'].includes(tabla)) {
    return NextResponse.json({ error: 'tabla/id inválidos' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (tabla === 'oportunidades') {
    if (!ESTADOS_OP.includes(estado)) return NextResponse.json({ error: 'estado inválido' }, { status: 400 });
    patch.estado = estado;
    patch.updated_at = new Date().toISOString();
    if (estado === 'archivada' && causa_muerte) patch.causa_muerte = String(causa_muerte).slice(0, 500);
  } else {
    patch.estado = String(estado ?? '').slice(0, 40);
  }
  const { error } = await db().from(tabla).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
