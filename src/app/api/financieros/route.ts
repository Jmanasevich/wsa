import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MODELO = process.env.CWGIA_MODEL || 'claude-sonnet-4-6';

const ESQUEMA = `Devuelve SOLO un bloque \`\`\`json con:
{ "periodo_reporte": "FY2025|H1-2026|Q3-2025|s/d", "fecha_publicacion": "YYYY-MM-DD|null",
  "ingresos_musd": number|null, "ebit_musd": number|null, "margen_pct": number|null,
  "resumen": "2-4 frases: que reporto y la lectura estrategica", "estrategia": "movimiento/estrategia detectada en 1 frase",
  "fuente": "url o nombre del reporte + fecha" }
Solo cifras verificadas del ultimo reporte publico (memoria/earnings/press release); si no hay, deja null y dilo en resumen. Nada inventado.`;

function extraer(texto: string): any | null {
  const m = texto.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const cron = secreto && req.headers.get('authorization') === `Bearer ${secreto}`;
  if (!cron && !autorizado(req)) return noAutorizado();

  const sp = req.nextUrl.searchParams;

  if (sp.get('lista') === '1') {
    const { data } = await db().from('financieros')
      .select('productor,pais,periodo_reporte,fecha_publicacion,ingresos_musd,margen_pct,resumen,estrategia,fuente')
      .order('fecha_publicacion', { ascending: false, nullsFirst: false });
    const visto = new Set<string>();
    const filas = (data ?? []).filter(f => { if (visto.has(f.productor)) return false; visto.add(f.productor); return true; });
    const { data: cotiz } = await db().from('productores').select('nombre').eq('cotiza', true);
    return NextResponse.json({ filas, cotizadas: (cotiz ?? []).map(c => c.nombre), leidas: filas.length });
  }

  let productor = sp.get('productor') || '';
  let pais = '';

  try {
    if (!productor) {
      const { data: cotiz } = await db().from('productores').select('nombre,pais').eq('cotiza', true);
      if (!cotiz?.length) return NextResponse.json({ error: 'sin cotizadas' }, { status: 400 });
      const { data: fin } = await db().from('financieros').select('productor,created_at').order('created_at', { ascending: false });
      const ultimo: Record<string, string> = {};
      for (const f of fin ?? []) if (!ultimo[f.productor]) ultimo[f.productor] = f.created_at as any;
      cotiz.sort((a, b) => (ultimo[a.nombre] || '') < (ultimo[b.nombre] || '') ? -1 : 1);
      productor = cotiz[0].nombre; pais = cotiz[0].pais;
    } else {
      const { data } = await db().from('productores').select('pais').eq('nombre', productor).limit(1);
      pais = data?.[0]?.pais || '';
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await anthropic.messages.create({
      model: MODELO, max_tokens: 2000,
      system: `Eres analista financiero del sector vino. Busca en la web el ULTIMO reporte financiero publico de "${productor}" (${pais}): memoria anual, resultados semestrales/trimestrales o press release de resultados. Extrae ingresos, resultado operacional y margen del segmento vino si esta desglosado, y la lectura estrategica (adquisiciones, premiumizacion, mercados que crecen/caen, cierres). ${ESQUEMA}`,
      messages: [{ role: 'user', content: `Ultimo balance/declaracion de ${productor}. Cifras verificadas y fechadas.` }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as any],
    });
    const texto = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    const j = extraer(texto);
    if (!j?.resumen) return NextResponse.json({ productor, error: 'sin datos estructurados', raw: texto.slice(0, 400) });

    const fila = {
      productor, pais,
      periodo_reporte: j.periodo_reporte || 's/d',
      fecha_publicacion: j.fecha_publicacion || null,
      ingresos_musd: j.ingresos_musd ?? null, ebit_musd: j.ebit_musd ?? null, margen_pct: j.margen_pct ?? null,
      resumen: String(j.resumen).slice(0, 2000), estrategia: j.estrategia ? String(j.estrategia).slice(0, 500) : null,
      fuente: j.fuente ? String(j.fuente).slice(0, 300) : null,
    };
    const { error } = await db().from('financieros').upsert(fila, { onConflict: 'productor,periodo_reporte' });
    if (error) return NextResponse.json({ productor, error: error.message });
    return NextResponse.json({ ok: true, productor, periodo: fila.periodo_reporte, resumen: fila.resumen });
  } catch (e: any) {
    return NextResponse.json({ productor, error: e?.message || 'Error' }, { status: 500 });
  }
}
