import { NextRequest, NextResponse } from 'next/server';
import { ejecutarAgente, Modo, Perfil } from '@/lib/agent';
import { autorizado, noAutorizado } from '@/lib/auth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MODOS: Modo[] = ['radar', 'deep_dive', 'deal', 'defensa', 'gancho', 'competidor', 'comparativo'];

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return noAutorizado();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const modo: Modo = MODOS.includes(body?.modo) ? body.modo : 'radar';
  const consulta = typeof body?.consulta === 'string' && body.consulta.trim()
    ? body.consulta.trim().slice(0, 4000)
    : 'Ejecuta un radar global: entrega el ranking de 3-5 movimientos priorizados.';
  const perfil: Perfil = ['A', 'B', 'C'].includes(body?.perfil) ? body.perfil : 'A';
  const verificarWeb = body?.verificar !== false;

  try {
    const r = await ejecutarAgente(modo, consulta, perfil, verificarWeb);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error del agente' }, { status: 500 });
  }
}
