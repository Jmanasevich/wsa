import Anthropic from '@anthropic-ai/sdk';
import { db } from './supabase';
import { promptMaestro, INSTRUCCION_SALIDA_JSON } from './prompt';

const MODELO = process.env.CWGIA_MODEL || 'claude-sonnet-4-6';

export type Modo = 'radar' | 'deep_dive' | 'deal' | 'defensa' | 'gancho' | 'competidor' | 'comparativo';

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

// ---------- Datos internos: embarques (UN Comtrade) y catálogo de fuentes ----------
const MAPA_MERCADOS: [string, string][] = [
  ['ee.uu', 'USA'], ['estados unidos', 'USA'], ['reino unido', 'United Kingdom'], ['brasil', 'Brazil'],
  ['china', 'China'], ['japón', 'Japan'], ['japon', 'Japan'], ['corea', 'Rep. of Korea'],
  ['canadá', 'Canada'], ['canada', 'Canada'], ['méxico', 'Mexico'], ['mexico', 'Mexico'],
  ['suecia', 'Sweden'], ['noruega', 'Norway'], ['finlandia', 'Finland'], ['alemania', 'Germany'],
  ['países bajos', 'Netherlands'], ['paises bajos', 'Netherlands'], ['holanda', 'Netherlands'],
  ['irlanda', 'Ireland'], ['dinamarca', 'Denmark'], ['francia', 'France'], ['españa', 'Spain'],
];
const NOMBRE_PARTIDA: Record<string, string> = {
  '220410': 'espumoso', '220421': 'embotellado ≤2L', '220422': 'formato 2-10L (BiB)', '220429': 'granel',
};

async function embarquesResumen(consulta: string): Promise<string> {
  try {
    const texto = consulta.toLowerCase();
    const objetivo = MAPA_MERCADOS.find(([es]) => texto.includes(es))?.[1] ?? null;
    if (objetivo) {
      const { data } = await db().from('embarques').select('partida,volumen_l,valor_usd')
        .eq('mercado', objetivo).eq('freq', 'M');
      if (!data?.length) return '';
      const por: Record<string, { v: number; u: number }> = {};
      for (const r of data) {
        const p = (por[r.partida] ??= { v: 0, u: 0 });
        p.v += Number(r.volumen_l) || 0; p.u += Number(r.valor_usd) || 0;
      }
      const lineas = Object.entries(por).sort((a, b) => b[1].u - a[1].u).map(([k, x]) =>
        `- ${NOMBRE_PARTIDA[k] ?? k}: US$ ${(x.u / 1e6).toFixed(1)}M FOB, ${(x.v / 1e6).toFixed(1)}M litros, precio medio US$ ${(x.u / (x.v || 1)).toFixed(2)}/L`);
      return `EMBARQUES DE VINO CHILENO A ${objetivo.toUpperCase()} — año 2025 completo, por partida [verificado: UN Comtrade, base interna]:\n${lineas.join('\n')}\nUsa estas cifras como línea base oficial del mercado; complementa con la web para lo corrido de 2026.`;
    }
    const { data } = await db().from('embarques').select('mercado,volumen_l,valor_usd').eq('freq', 'M');
    if (!data?.length) return '';
    const agg: Record<string, { u: number; v: number }> = {};
    for (const r of data) {
      const p = (agg[r.mercado] ??= { u: 0, v: 0 });
      p.u += Number(r.valor_usd) || 0; p.v += Number(r.volumen_l) || 0;
    }
    const top = Object.entries(agg).sort((a, b) => b[1].u - a[1].u).slice(0, 10)
      .map(([m, x], i) => `${i + 1}. ${m}: US$ ${(x.u / 1e6).toFixed(0)}M FOB (precio medio US$ ${(x.u / (x.v || 1)).toFixed(2)}/L)`);
    return 'TOP 10 MERCADOS DEL VINO CHILENO 2025 [verificado: UN Comtrade, base interna]:\n' + top.join('\n');
  } catch { return ''; }
}

async function embarquesPorVina(consulta: string): Promise<string> {
  try {
    const t = consulta.toLowerCase();
    const { data: vinas } = await db().from('embarques_vina').select('vina').limit(2000);
    if (!vinas?.length) return '';
    const nombres = Array.from(new Set(vinas.map(v => v.vina)));
    const objetivo = nombres.find(n => t.includes(n.toLowerCase().split(' (')[0].toLowerCase()));
    if (objetivo) {
      const { data } = await db().from('embarques_vina').select('mercado,formato,volumen_l,valor_usd').eq('vina', objetivo);
      if (!data?.length) return '';
      const porMercado: Record<string, { u: number; l: number }> = {};
      for (const r of data) { const p = (porMercado[r.mercado] ??= { u: 0, l: 0 }); p.u += Number(r.valor_usd) || 0; p.l += Number(r.volumen_l) || 0; }
      const top = Object.entries(porMercado).sort((a, b) => b[1].u - a[1].u).slice(0, 12)
        .map(([m, x]) => `- ${m}: US$ ${(x.u / 1e6).toFixed(2)}M FOB, ${(x.l / 1e3).toFixed(0)} mil L, precio medio US$ ${(x.u / (x.l || 1)).toFixed(2)}/L`);
      const total = Object.values(porMercado).reduce((s, x) => s + x.u, 0);
      return `EMBARQUES REALES DE ${objetivo.toUpperCase()} — año 2025, por mercado [verificado: Aduana de Chile / datos.gob.cl, nivel exportador]. Total identificado US$ ${(total / 1e6).toFixed(1)}M:\n${top.join('\n')}\nNota: cobertura ~60% del vino chileno mapea a viña por nombre; usa esto como piso verificado y contrasta con la web para lo no cubierto.`;
    }
    const { data } = await db().from('embarques_vina').select('vina,valor_usd');
    if (!data?.length) return '';
    const agg: Record<string, number> = {};
    for (const r of data) agg[r.vina] = (agg[r.vina] || 0) + (Number(r.valor_usd) || 0);
    const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([v, u], i) => `${i + 1}. ${v}: US$ ${(u / 1e6).toFixed(0)}M FOB`);
    return 'RANKING DE VIÑAS EXPORTADORAS CHILENAS 2025 [verificado: Aduana de Chile / datos.gob.cl, nivel exportador]:\n' + top.join('\n');
  } catch { return ''; }
}

async function competenciaPorOrigen(consulta: string): Promise<string> {
  const t = consulta.toLowerCase();
  const MAP: [string, string][] = [['ee.uu', 'EE.UU.'], ['estados unidos', 'EE.UU.'], ['reino unido', 'Reino Unido'], ['uk', 'Reino Unido'], ['brasil', 'Brasil'], ['china', 'China'], ['jap', 'Japon'], ['corea', 'Corea del Sur'], ['canad', 'Canada'], ['mexico', 'Mexico'], ['méxico', 'Mexico'], ['suecia', 'Suecia'], ['alemania', 'Alemania'], ['irlanda', 'Irlanda'], ['dinamarca', 'Dinamarca'], ['países bajos', 'Paises Bajos'], ['holanda', 'Paises Bajos'], ['colombia', 'Colombia'], ['peru', 'Peru'], ['perú', 'Peru']];
  const merc = MAP.find(([k]) => t.includes(k))?.[1];
  if (!merc) return '';
  try {
    const { data } = await db().from('mercado_origen').select('origen,anio,valor_usd,litros').eq('mercado', merc);
    if (!data?.length) return '';
    const anios = Array.from(new Set(data.map((r: any) => r.anio))).sort((a: number, b: number) => b - a);
    const anio = anios[0]; const prev = anios.find((y: number) => y < anio);
    const cur = data.filter((r: any) => r.anio === anio);
    const total = cur.reduce((s: number, r: any) => s + Number(r.valor_usd || 0), 0) || 1;
    const prevMap: Record<string, number> = {};
    if (prev != null) for (const r of data.filter((r: any) => r.anio === prev)) prevMap[r.origen] = Number(r.valor_usd || 0);
    const filas = cur.map((r: any) => {
      const u = Number(r.valor_usd || 0); const l = Number(r.litros || 0); const p = prevMap[r.origen];
      return { o: r.origen, u, pl: l > 0 ? u / l : null, sh: 100 * u / total, d: p ? 100 * (u - p) / p : null };
    }).sort((a: any, b: any) => b.u - a.u);
    const top = filas.slice(0, 8).map((f: any, i: number) => `${i + 1}. ${f.o} ${f.sh.toFixed(1)}% (US$${(f.u / 1e6).toFixed(0)}M${f.pl != null ? `, US$${f.pl.toFixed(2)}/L` : ''}${f.d != null ? `, ${f.d > 0 ? '+' : ''}${f.d.toFixed(0)}% a/a` : ''})`).join('\n');
    const ch: any = filas.find((f: any) => /chile/i.test(f.o)); const chRank = ch ? filas.indexOf(ch) + 1 : null;
    const arg: any = filas.find((f: any) => /argentin/i.test(f.o));
    const suben = filas.filter((f: any) => f.d != null && f.d > 5).map((f: any) => f.o).slice(0, 4);
    const bajan = filas.filter((f: any) => f.d != null && f.d < -5).map((f: any) => f.o).slice(0, 4);
    let precioNota = '';
    if (ch?.pl != null) {
      const masBaratos = filas.filter((f: any) => f.pl != null && f.pl < ch.pl && f.sh > 1).length;
      precioNota = ` Precio Chile US$${ch.pl.toFixed(2)}/L${arg?.pl != null ? ` vs Argentina US$${arg.pl.toFixed(2)}/L (${(arg.pl / ch.pl).toFixed(1)}x)` : ''}; solo ${masBaratos} origen(es) relevante(s) más barato(s) que Chile.`;
    }
    return `COMPETENCIA POR ORIGEN EN ${merc} (importaciones ${anio}, Comtrade — el tablero mundial):\n${top}\n${ch ? `Chile: #${chRank} con ${ch.sh.toFixed(1)}% de share (US$${(ch.u / 1e6).toFixed(0)}M${ch.d != null ? `, ${ch.d > 0 ? '+' : ''}${ch.d.toFixed(0)}% a/a` : ''}).${precioNota}` : 'Chile no figura entre los orígenes cargados de este mercado.'}\nCrecen: ${suben.join(', ') || '—'}. Caen: ${bajan.join(', ') || '—'}.\nLECTURA OBLIGATORIA: (1) distingue si Chile pierde participación frente a otros ORÍGENES (Argentina, Australia, Italia) o si toda la categoría se contrae; (2) LEE EL PRECIO: si Chile tiene el menor US$/L, está atrapado en el tramo barato y un rival como Argentina puede facturar lo mismo con menos volumen a mayor precio — esa es la palanca de premiumización. Nombra al rival y el gap de precio.`;
  } catch { return ''; }
}

async function compradoresYpremios(consulta: string): Promise<string> {
  const partes: string[] = [];
  const t = consulta.toLowerCase();
  const MAP: [string, string][] = [['ee.uu', 'EE.UU.'], ['estados unidos', 'EE.UU.'], ['reino unido', 'Reino Unido'], ['uk', 'Reino Unido'], ['brasil', 'Brasil'], ['china', 'China'], ['jap', 'Japon'], ['japon', 'Japon'], ['corea', 'Corea del Sur'], ['canad', 'Canada'], ['mexico', 'Mexico'], ['m\u00e9xico', 'Mexico'], ['suecia', 'Suecia'], ['noruega', 'Noruega'], ['finlandia', 'Finlandia'], ['alemania', 'Alemania'], ['irlanda', 'Irlanda'], ['pa\u00edses bajos', 'Paises Bajos'], ['holanda', 'Paises Bajos']];
  try {
    const merc = MAP.find(([k]) => t.includes(k))?.[1];
    let q = db().from('compradores').select('mercado,nombre,tipo,portafolio,canal,nota').eq('activo', true);
    if (merc) {
      const { data } = await db().from('compradores').select('mercado,nombre,tipo,portafolio,canal,nota').eq('activo', true).ilike('mercado', merc.replace('Paises', 'Pa%ses').replace('Japon', 'Jap%n').replace('Canada', 'Canad%').replace('Mexico', 'M%xico'));
      if (data?.length) partes.push(`COMPRADORES REALES EN ${merc.toUpperCase()} (importadores/agentes/retailers activos; contactos y hueco de portafolio se confirman en la web). Usa estos nombres como contraparte concreta \u2014 NO inventes otros:\n` +
        data.slice(0, 14).map(c => `- ${c.nombre} [${c.tipo}${c.canal ? ', ' + c.canal : ''}]${c.portafolio ? ': ' + c.portafolio : ''}${c.nota ? ' (' + c.nota + ')' : ''}`).join('\n'));
    }
  } catch { /* opcional */ }
  try {
    const { data } = await db().from('premios').select('jurado,productor,vino,cepa,puntaje,anio,mercado').order('anio', { ascending: false }).limit(40);
    if (data?.length) {
      const rel = data.filter(p => t.includes(String(p.productor ?? '').toLowerCase().split(' ')[0]) || t.includes(String(p.cepa ?? '').toLowerCase()) || (MAP.find(([k]) => t.includes(k)) && p.mercado && t.includes(String(p.mercado).toLowerCase())));
      const uso = (rel.length ? rel : data).slice(0, 12);
      partes.push('PREMIOS Y PUNTAJES RECIENTES [base interna]. Usa como palanca de listado o se\u00f1al competitiva:\n' +
        uso.map(p => `- ${p.jurado} ${p.anio ?? ''}: ${p.vino ?? ''}${p.productor ? ' (' + p.productor + ')' : ''}${p.cepa ? ' \u00b7 ' + p.cepa : ''} \u2192 ${p.puntaje ?? ''}`).join('\n'));
    }
  } catch { /* opcional */ }
  return partes.join('\n\n');
}

async function financierosRelevantes(consulta: string): Promise<string> {
  try {
    const t = consulta.toLowerCase();
    const dispara = t.includes('competidor') || t.includes('estrategia') || t.includes('balance') || t.includes('financ') || t.includes('comparativo') || t.includes('vs ') || t.includes('versus');
    const { data } = await db().from('financieros')
      .select('productor,periodo_reporte,fecha_publicacion,ingresos_musd,margen_pct,resumen,estrategia')
      .order('fecha_publicacion', { ascending: false, nullsFirst: false }).limit(30);
    if (!data?.length) return '';
    const nombra = data.filter(f => t.includes(String(f.productor).toLowerCase().split(' (')[0]));
    const uso = nombra.length ? nombra : (dispara ? data.slice(0, 6) : []);
    if (!uso.length) return '';
    const lin = uso.map(f => `- ${f.productor} (${f.periodo_reporte ?? 's/d'}${f.fecha_publicacion ? ', ' + f.fecha_publicacion : ''}): ${f.ingresos_musd ? 'ingresos US$ ' + (Number(f.ingresos_musd) / 1000).toFixed(2) + 'B, ' : ''}${f.margen_pct != null ? 'margen ' + f.margen_pct + '%. ' : ''}${f.resumen ?? ''}${f.estrategia ? ' \u2192 Estrategia: ' + f.estrategia : ''}`);
    return 'VIGILANCIA FINANCIERA DE COMPETIDORES [verificado: balances y declaraciones publicas]. Lee la estrategia de sus cifras y anticipa movimientos:\n' + lin.join('\n');
  } catch { return ''; }
}

async function productoresMundo(consulta: string): Promise<string> {
  try {
    const t = consulta.toLowerCase();
    const PAISES = ['francia', 'italia', 'espana', 'ee.uu', 'estados unidos', 'argentina', 'australia', 'sudafrica', 'alemania', 'portugal', 'nueva zelanda'];
    const nombra = PAISES.some(p => t.includes(p)) || t.includes('competidor') || t.includes('productor') || t.includes('mundo');
    if (!nombra) return '';
    const { data } = await db().from('productores').select('pais,nombre,grupo,marcas,segmento,revenue_musd').limit(200);
    if (!data?.length) return '';
    const paisPedido = PAISES.find(p => t.includes(p));
    const mapa: Record<string, string> = { 'espana': 'Espana', 'sudafrica': 'Sudafrica', 'estados unidos': 'EE.UU.', 'ee.uu': 'EE.UU.' };
    let filtradas = data;
    if (paisPedido) {
      const canon = mapa[paisPedido] || (paisPedido.charAt(0).toUpperCase() + paisPedido.slice(1));
      const sel = data.filter(d => d.pais.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === canon.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      if (sel.length) filtradas = sel;
    }
    const lineas = filtradas.slice(0, 40).map(d =>
      `- [${d.pais}] ${d.nombre}${d.grupo && d.grupo !== d.nombre ? ' (grupo ' + d.grupo + ')' : ''}: ${d.marcas ?? ''}${d.segmento ? ' \u2014 ' + d.segmento : ''}${d.revenue_musd ? ` [facturacion grupo ~US$ ${(Number(d.revenue_musd) / 1000).toFixed(1)}B, estimacion publica]` : ''}`);
    let finTxt = '';
    try {
      const { data: fin } = await db().from('financieros').select('productor,periodo_reporte,fecha_publicacion,ingresos_musd,margen_pct,resumen,estrategia').order('fecha_publicacion', { ascending: false, nullsFirst: false }).limit(30);
      const rel = (fin ?? []).filter((f: any) => filtradas.some(d => d.nombre.toLowerCase().includes(String(f.productor).toLowerCase().split(' (')[0]) || String(f.productor).toLowerCase().includes(d.nombre.toLowerCase().split(' (')[0])) || t.includes(String(f.productor).toLowerCase().split(' (')[0]));
      const uso = (rel.length ? rel : (fin ?? [])).slice(0, 8);
      if (uso.length) finTxt = '\n\nBALANCES Y DECLARACIONES RECIENTES (vigilancia financiera propia, para leer estrategia) [verificado: reportes publicos]:\n' +
        uso.map((f: any) => `- ${f.productor} (${f.periodo_reporte ?? 's/d'}${f.fecha_publicacion ? ', ' + f.fecha_publicacion : ''}): ${f.ingresos_musd ? 'ingresos US$ ' + (Number(f.ingresos_musd)/1000).toFixed(2) + 'B, ' : ''}${f.margen_pct ? 'margen ' + f.margen_pct + '%. ' : ''}${f.resumen ?? ''}${f.estrategia ? ' Estrategia: ' + f.estrategia : ''}`).join('\n');
    } catch { /* opcional */ }
    return 'DIRECTORIO DE PRODUCTORES DEL MUNDO (top vinas por pais; usalo para el modo Competidor y contexto competitivo). La facturacion es de GRUPO y orden de magnitud publico \u2014 verificala/actualizala en la web; NO es venta por mercado:\n' + lineas.join('\n') + finTxt;
  } catch { return ''; }
}

async function fuentesRelevantes(consulta: string): Promise<string> {
  try {
    const { data } = await db().from('fuentes').select('tipo,nombre,mercado,url,descripcion')
      .eq('activo', true).limit(200);
    if (!data?.length) return '';
    const texto = consulta.toLowerCase();
    const delMercado = data.filter(f => f.mercado !== 'Global' && texto.includes(String(f.mercado).toLowerCase()));
    const globales = data.filter(f => f.mercado === 'Global');
    const sel = [...delMercado, ...globales].slice(0, 22);
    if (!sel.length) return '';
    const lista = sel.map(f =>
      `- [${f.tipo}] ${f.nombre}${f.mercado !== 'Global' ? ' (' + f.mercado + ')' : ''}${f.url ? ' — ' + f.url : ''}${f.descripcion ? ': ' + f.descripcion : ''}`);
    return 'CATÁLOGO INTERNO DE FUENTES PRIORITARIAS (consúltalas primero; los líderes de opinión, concursos y ferias son además palancas comerciales — medallas, puntajes y presencia en feria abren canales):\n' + lista.join('\n');
  } catch { return ''; }
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
  const [memoria, conocimiento, embarques, porVina, mundo, financieros, compradores, fuentes, origenes] = await Promise.all([
    contextoDeTrabajo(), conocimientoRelevante(consulta), embarquesResumen(consulta), embarquesPorVina(consulta), productoresMundo(consulta), financierosRelevantes(consulta), compradoresYpremios(consulta), competenciaPorOrigen(consulta), fuentesRelevantes(consulta),
  ]);

  const system = [promptMaestro(), embarques, porVina, mundo, origenes, financieros, compradores, fuentes, conocimiento, memoria, INSTRUCCION_SALIDA_JSON].filter(Boolean).join('\n\n---\n\n');
  const etiquetaModo = {
    radar: 'RADAR', deep_dive: 'DEEP-DIVE', deal: 'DEAL', defensa: 'DEFENSA',
    gancho: 'DIAGNÓSTICO EJECUTIVO (informe de conquista para un GG; sigue [MODO GANCHO])', competidor: 'COMPETIDOR (vigilancia de un actor)',
    comparativo: 'COMPARATIVO DE VENTAS (sigue [MODO COMPARATIVO])',
  }[modo];
  const user = `[MODO: ${etiquetaModo}] [PERFIL: ${PERFILES[perfil]}]\n\n${consulta}`;

  const req: Anthropic.MessageCreateParamsNonStreaming = {
    model: MODELO,
    max_tokens: 20000,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (verificarWeb) {
    (req as any).tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }];
  }

  const resp = await anthropic.messages.create(req);
  const texto = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const datos = extraerJSON(texto);
  // Eliminar TODO bloque json del informe visible, incluido uno truncado por tope de tokens.
  const informe = texto.replace(/```json[\s\S]*?```/g, '').replace(/```json[\s\S]*$/, '').trim();
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
