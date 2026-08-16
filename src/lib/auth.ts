import { NextRequest, NextResponse } from 'next/server';

// Si APP_ACCESS_TOKEN está configurado, toda API lo exige (header x-access-token).
export function autorizado(req: NextRequest): boolean {
  const esperado = process.env.APP_ACCESS_TOKEN;
  if (!esperado) return true;
  return req.headers.get('x-access-token') === esperado;
}

export function noAutorizado() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}
