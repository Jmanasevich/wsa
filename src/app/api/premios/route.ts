import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/supabase';
import { autorizado, noAutorizado } from '@/lib/auth';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MODELO = process.env.CWGIA_MODEL || 'claude-sonnet-4-6';

// Mercados clave a rotar cuando no se pasa uno explícito.
const MERCADOS = ['Reino Unido', 'EE.UU.', 'Brasil', 'China', 'Japón', 'Canadá', 'Países Bajos', 'Corea del Sur'];

const ESQUEMA = `Devuelve SOLO un bloque \`\`\`json con:
{ "premios": [ { "jurado": "concurso o crítico (ej. Decanter World Wine Awards, James Suckling, IWSC, Tim Atkin)",
  "mercado": "mercado donde ese jurado mueve la aguja", "productor": "viña/marca", "vino": "etiqueta exacta",
  "cepa": "cepa o mezcla", "puntaje": "medalla o puntaje (ej. 95, Gold, Platinum)", "anio": number, "fuente": "url o publicación + fecha" } ] }
Solo premios/puntajes verificados y recientes (últimos 24 meses) a vinos CHILENOS. Prioriza jurados con peso comercial en el mercado indicado. Nada inventado; si no encuentras, devuelve premios: [].`;

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
    const { data } = await db().from('premios')
      .select('jurado,mercado,productor,vino,cepa,puntaje,anio,fuente')
      .order('anio', { ascending: false }).limit(300);
    return NextResponse.json({ items: data ?? [], n: (data ?? []).length });
  }

  // mercado explícito o rotación por el menos actualizado
  let mercado = sp.get('mercado') || '';
  if (!mercado) {
    const { data } = await db().from('premios').select('mercado,created_at').order('created_at', { ascending: false });
    const ultimo: Record<string, string> = {};
    for (const p of data ?? []) if (!ultimo[p.mercado]) ultimo[p.mercado] = p.created_at as any;
    const ord = [...MERCADOS].sort((a, b) => (ultimo[a] || '') < (ultimo[b] || '') ? -1 : 1);
    mercado = ord[0];
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await anthropic.messages.create({
      model: MODELO, max_tokens: 3000,
      system: `Eres analista de premios y crítica del vino chileno. Busca en la web premios, medallas y puntajes recientes (últimos 24 meses) otorgados a vinos CHILENOS por jurados y críticos con peso comercial en el mercado "${mercado}" (concursos como Decanter DWWA, IWSC, IWC, Concours Mondial; críticos como James Suckling, Tim Atkin MW, Descorchados, Wine Advocate). Para cada uno registra jurado, viña, etiqueta, cepa, medalla/puntaje, año y fuente. ${ESQUEMA}`,
      messages: [{ role: 'user', content: `Premios y puntajes recientes a vinos chilenos relevantes para ${mercado}. Verificados y fechados.` }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as any],
    });
    const texto = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    const j = extraer(texto);
    const premios: any[] = Array.isArray(j?.premios) ? j.premios : [];
    if (!premios.length) return NextResponse.json({ mercado, guardados: 0, nota: 'sin premios estructurados', raw: texto.slice(0, 300) });

    // dedup por (jurado,vino,anio) antes de upsert
    const visto = new Set<string>();
    const filas = premios.map((p: any) => ({
      jurado: String(p.jurado || '').slice(0, 160),
      mercado: p.mercado ? String(p.mercado).slice(0, 60) : mercado,
      productor: p.productor ? String(p.productor).slice(0, 160) : null,
      vino: String(p.vino || '').slice(0, 200),
      cepa: p.cepa ? String(p.cepa).slice(0, 80) : null,
      puntaje: p.puntaje != null ? String(p.puntaje).slice(0, 40) : null,
      anio: Number(p.anio) || null,
      fuente: p.fuente ? String(p.fuente).slice(0, 300) : null,
    })).filter((f) => {
      if (!f.jurado || !f.vino || !f.anio) return false;
      const k = `${f.jurado}|${f.vino}|${f.anio}`;
      if (visto.has(k)) return false; visto.add(k); return true;
    });
    const { error } = await db().from('premios').upsert(filas, { onConflict: 'jurado,vino,anio' });
    if (error) return NextResponse.json({ mercado, error: error.message });
    return NextResponse.json({ ok: true, mercado, guardados: filas.length });
  } catch (e: any) {
    return NextResponse.json({ mercado, error: e?.message || 'Error' }, { status: 500 });
  }
}
