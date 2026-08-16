import Anthropic from '@anthropic-ai/sdk';
import { db } from './supabase';
import { promptMaestro, INSTRUCCION_SALIDA_JSON } from './prompt';

const MODELO = process.env.CWGIA_MODEL || 'claude-sonnet-4-6';

export type Modo = 'radar' | 'deep_dive' | 'deal' | 'defensa';

export interface ResultadoAgente {
  informe_md: string;
  guardado: { oportunidades: number; senales: number; ventanas: number };
  tokens_in: number;
  tokens_out: number;
  duracion_ms: number;
}

// ---------- Memoria de trabajo: contexto desde Supabase ----------
async function contextoDeTrabajo(): Promise<string> {
  const hoy = new Date().toISOString().slice(0, 10);
  const partes: string[] = [];
  try {
    const [ops, vens, sens] = await Promise.all([
      db().from('oportunidades')
        .select('titulo,mercado,canal,palanca,score,estado,causa_muerte,ventana_fecha')
        .neq('estado', 'archivada').order('score', { ascending: false }).limit(15),
      db().from('ventanas')
        .select('tipo,entidad,mercado,descripcion,fecha_cierre,url')
        .eq('estado', 'abierta').gte('fecha_cierre', hoy)
        .order('fecha_cierre', { ascending: true }).limit(10),
      db().from('senales')
        .select('tipo,descripcion,mercado,fuente,fecha_dato')
        .eq('estado', 'incubacion').order('created_at', { ascending: false }).limit(10),
    ]);
    if (ops.data?.length) {
      partes.push('PIPELINE VIVO (no reanalizar desde cero; actualizar solo lo que cambió):\n' +
        ops.data.map(o => `- [${o.estado}] ${o.titulo} | ${o.mercado ?? ''}/${o.canal ?? ''} | palanca ${o.palanca ?? '-'} | score ${o.score ?? '-'}`).join('\n'));
    }
    if (vens.data?.length) {
      partes.push('VENTANAS ABIERTAS (reportar las que cierran en ≤30 días aunque nadie pregunte):\n' +
        vens.data.map(v => `- ${v.entidad} (${v.mercado ?? '-'}) ${v.tipo ?? ''}: ${v.descripcion ?? ''} — cierra ${v.fecha_cierre}`).join('\n'));
    }
    if (sens.data?.length) {
      partes.push('SEÑALES EN INCUBACIÓN (buscar segunda señal convergente):\n' +
        sens.data.map(s => `- [${s.tipo ?? '-'}] ${s.descripcion} (${s.fuente ?? 's/f'}, ${s.fecha_dato ?? 's/fecha'})`).join('\n'));
    }
  } catch {
    // Sin DB no se bloquea la consulta: el agente opera sin memoria.
  }
  if (!partes.length) return 'MEMORIA DE TRABAJO: vacía (primera sesión). Construye pipeline desde cero.';
  return 'MEMORIA DE TRABAJO ACTUAL (fecha ' + hoy + '):\n\n' + partes.join('\n\n');
}

// ---------- Base de conocimiento interna ----------
async function conocimientoRelevante(consulta: string): Promise<string> {
  try {
    const { data } = await db().from('conocimiento')
      .select('tipo,titulo,contenido,mercado,cepa,fuente,fecha_dato')
      .eq('activo', true)
      .order('fecha_dato', { ascending: false, nullsFirst: false })
      .limit(60);
    if (!data?.length) return '';
    const texto = consulta.toLowerCase();
    const puntaje = (d: any) => {
      let s = 0;
      if (d.mercado && texto.includes(String(d.mercado).toLowerCase())) s += 3;
      if (d.cepa && texto.includes(String(d.cepa).toLowerCase())) s += 3;
      for (const w of String(d.titulo).toLowerCase().split(/[^a-záéíóúñü0-9]+/)) {
        if (w.length > 3 && texto.includes(w)) s += 1;
      }
      return s;
    };
    const orden = data.map((d, i) => ({ d, s: puntaje(d), i })).sort((a, b) => b.s - a.s || a.i - b.i);
    const seleccion = orden.filter((x, idx) => x.s > 0 || idx < 4).slice(0, 10);
    let presupuesto = 14000;
    const partes: string[] = [];
    for (const { d } of seleccion) {
      const bloque = `### [${d.tipo ?? 'nota'}] ${d.titulo} (${d.fuente ?? 'fuente interna'}, ${d.fecha_dato ?? 's/fecha'})` +
        `${d.mercado ? ' · ' + d.mercado : ''}${d.cepa ? ' · ' + d.cepa : ''}\n${String(d.contenido).slice(0, 2200)}`;
      if (presupuesto - bloque.length < 0) break;
      presupuesto -= bloque.length;
      partes.push(bloque);
    }
    if (!partes.length) return '';
    return 'BASE DE CONOCIMIENTO INTERNA (datos cargados por el usuario: extractos Nielsen/IWSR, estadísticas de exportación, listas de precios, notas). Trátalos como dato [verificado: interno + fuente + fecha], priorízalos sobre estimaciones propias y crúzalos con lo que encuentres en la web:\n\n' + partes.join('\n\n');
  } catch { return ''; }
}

// ---------- Persistencia de la salida estructurada ----------
function extraerJSON(texto: string): any | null {
  const m = texto.match(/```json\s*([\s\S]*?)```/g);
  if (!m?.length) return null;
  const ultimo = m[m.length - 1].replace(/```json\s*/, '').replace(/```$/, '');
  try { return JSON.parse(ultimo); } catch { return null; }
}

const limpiar = (v: unknown) => (v === '' || v === undefined ? null : v);

async function persistir(data: any, modo: Modo, informe: string) {
  const g = { oportunidades: 0, senales: 0, ventanas: 0 };
  if (!data) return g;
  try {
    if (Array.isArray(data.oportunidades) && data.oportunidades.length) {
      const filas = data.oportunidades.filter((o: any) => o?.titulo).map((o: any) => ({
        modo, titulo: o.titulo, hipotesis: limpiar(o.hipotesis), palanca: limpiar(o.palanca),
        mercado: limpiar(o.mercado), canal: limpiar(o.canal), cepa: limpiar(o.cepa),
        contraparte: limpiar(o.contraparte), ventana_fecha: limpiar(o.ventana_fecha),
        margen_caja_usd: o.margen_caja_usd ?? null, ebitda_estimado_usd: o.ebitda_estimado_usd ?? null,
        score: o.score ?? null, senales: o.senales ?? [], fuentes: o.fuentes ?? [], informe_md: informe,
      }));
      const r = await db().from('oportunidades').insert(filas);
      if (!r.error) g.oportunidades = filas.length;
    }
    if (Array.isArray(data.senales) && data.senales.length) {
      const filas = data.senales.filter((s: any) => s?.descripcion).map((s: any) => ({
        tipo: limpiar(s.tipo), descripcion: s.descripcion, mercado: limpiar(s.mercado),
        fuente: limpiar(s.fuente), fecha_dato: limpiar(s.fecha_dato), proxima_revision: limpiar(s.proxima_revision),
      }));
      const r = await db().from('senales').insert(filas);
      if (!r.error) g.senales = filas.length;
    }
    if (Array.isArray(data.ventanas) && data.ventanas.length) {
      const filas = data.ventanas.filter((v: any) => v?.entidad).map((v: any) => ({
        tipo: limpiar(v.tipo), entidad: v.entidad, mercado: limpiar(v.mercado),
        descripcion: limpiar(v.descripcion), fecha_cierre: limpiar(v.fecha_cierre), url: limpiar(v.url),
      }));
      const r = await db().from('ventanas').insert(filas);
      if (!r.error) g.ventanas = filas.length;
    }
  } catch { /* la persistencia nunca rompe la respuesta */ }
  return g;
}

// ---------- Ejecución principal ----------
export type Perfil = 'A' | 'B' | 'C';
const PERFILES: Record<Perfil, string> = {
  A: 'A (Grande/Tier-1: marcas globales, distribución propia)',
  B: 'B (Mediana: exporta vía importadores, marca con tracción)',
  C: 'C (Boutique/pequeña: volumen limitado, nichos de alto margen)',
};

export async function ejecutarAgente(modo: Modo, consulta: string, perfil: Perfil, verificarWeb = true): Promise<ResultadoAgente> {
  const inicio = Date.now();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const [memoria, conocimiento] = await Promise.all([contextoDeTrabajo(), conocimientoRelevante(consulta)]);

  const system = [promptMaestro(), conocimiento, memoria, INSTRUCCION_SALIDA_JSON].filter(Boolean).join('\n\n---\n\n');
  const etiquetaModo = { radar: 'RADAR', deep_dive: 'DEEP-DIVE', deal: 'DEAL', defensa: 'DEFENSA' }[modo];
  const user = `[MODO: ${etiquetaModo}] [PERFIL: ${PERFILES[perfil]}]\n\n${consulta}`;

  const req: Anthropic.MessageCreateParamsNonStreaming = {
    model: MODELO,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (verificarWeb) {
    (req as any).tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }];
  }

  const resp = await anthropic.messages.create(req);
  const texto = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const datos = extraerJSON(texto);
  // Eliminar TODO bloque json del informe visible (el modelo a veces no lo deja al final).
  const informe = texto.replace(/```json[\s\S]*?```/g, '').trim();
  const guardado = await persistir(datos, modo, informe);

  const resultado: ResultadoAgente = {
    informe_md: informe || texto,
    guardado,
    tokens_in: (resp.usage as any)?.input_tokens ?? 0,
    tokens_out: (resp.usage as any)?.output_tokens ?? 0,
    duracion_ms: Date.now() - inicio,
  };

  try {
    await db().from('consultas').insert({
      modo, perfil, consulta, informe_md: resultado.informe_md,
      tokens_in: resultado.tokens_in, tokens_out: resultado.tokens_out, duracion_ms: resultado.duracion_ms,
    });
  } catch { /* log best-effort */ }

  return resultado;
}
