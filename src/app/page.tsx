'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { marked } from 'marked';

type Modo = 'radar' | 'deep_dive' | 'deal' | 'defensa';

const MODOS: { id: Modo; nombre: string; hint: string }[] = [
  { id: 'radar', nombre: 'Radar', hint: 'Barrido amplio de mercados y canales. Devuelve un ranking de 3-5 oportunidades priorizadas con score y contraparte.' },
  { id: 'deep_dive', nombre: 'Deep-Dive', hint: 'Análisis profundo de un mercado, canal o marca: cascada de precios, competencia y plan de entrada con hitos.' },
  { id: 'deal', nombre: 'Deal', hint: 'Evalúa una oferta concreta (importador, tender, private label): aceptar, contraofertar o rechazar, con números.' },
  { id: 'defensa', nombre: 'Defensa', hint: 'Detecta dónde la viña está perdiendo participación o margen hoy, qué competidor lo causa y cómo responder.' },
];

const PERFILES = [
  ['A', 'Viña grande'],
  ['B', 'Viña mediana'],
  ['C', 'Viña boutique'],
] as const;

const ESTADOS = ['nueva', 'validada', 'en_piloto', 'ejecutada', 'archivada'];

const MERCADOS = ['Global', 'EE.UU.', 'Reino Unido', 'Brasil', 'China', 'Japón', 'Corea del Sur', 'Canadá', 'México', 'Suecia', 'Noruega', 'Finlandia', 'Alemania', 'Países Bajos', 'Irlanda', 'Otro (indicar en la consulta)'];
const CANALES = ['Todos los canales', 'Retail / Off-trade', 'Monopolio estatal', 'On-trade / HORECA', 'E-commerce / DTC', 'Private label', 'Granel'];
const CEPAS = ['Todas las cepas', 'Sauvignon Blanc', 'Pinot Noir', 'Cabernet Sauvignon', 'Carmenère', 'Chardonnay', 'Syrah', 'Cinsault / País (Itata-Maule)', 'Blend tinto', 'Espumoso', 'Rosado', 'NoLo (sin/bajo alcohol)', 'Orgánico / sustentable'];

export default function Home() {
  const [modo, setModo] = useState<Modo>('radar');
  const [perfil, setPerfil] = useState<'A' | 'B' | 'C'>('A');
  const [verificar, setVerificar] = useState(true);
  const [mercadoSel, setMercadoSel] = useState(MERCADOS[0]);
  const [canalSel, setCanalSel] = useState(CANALES[0]);
  const [cepaSel, setCepaSel] = useState(CEPAS[0]);
  const [consulta, setConsulta] = useState('');
  const [token, setToken] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [informe, setInforme] = useState('');
  const [meta, setMeta] = useState('');
  const [pipeline, setPipeline] = useState<any>(null);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['x-access-token'] = token;
    return h;
  };

  const cargarPipeline = async () => {
    try {
      const r = await fetch('/api/pipeline', { headers: headers() });
      if (r.ok) setPipeline(await r.json());
    } catch { /* silencioso */ }
  };

  useEffect(() => { cargarPipeline(); /* eslint-disable-next-line */ }, []);

  const docReporte = (cuerpo: string, extraHead = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>CWG-IA — Informe</title>${extraHead}
      <style>body{font-family:Georgia,serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#2C3A42;line-height:1.55}
      .cab{font-family:Helvetica,Arial,sans-serif;border-bottom:3px solid #722F37;padding-bottom:10px;margin-bottom:20px}
      .cab h1{margin:0;color:#722F37;font-size:1.3rem}.cab p{margin:4px 0 0;color:#8B9AA3;font-size:.8rem}
      h1,h2,h3{color:#722F37;font-family:Helvetica,Arial,sans-serif}table{border-collapse:collapse;width:100%;font-size:.9rem}th{background:#46525A;color:#fff;text-align:left;padding:6px}
      td{border-bottom:1px solid #ddd;padding:6px;vertical-align:top}blockquote{border-left:4px solid #722F37;margin-left:0;padding-left:14px;font-style:italic;color:#6b5b5d}
      .spin{width:34px;height:34px;border-radius:50%;border:4px solid #eee;border-top-color:#722F37;animation:g 0.9s linear infinite;margin:0 auto 18px}@keyframes g{to{transform:rotate(360deg)}}
      @media print{button{display:none}}</style></head><body>${cuerpo}</body></html>`;

  const escribir = (w: Window | null, html: string) => {
    if (!w || w.closed) return;
    w.document.open(); w.document.write(html); w.document.close();
  };

  const htmlInforme = (md: string) => {
    const fecha = new Date().toLocaleString('es-CL');
    const modoN = MODOS.find(m => m.id === modo)?.nombre ?? modo;
    const perfilN = PERFILES.find(([p]) => p === perfil)?.[1] ?? perfil;
    return docReporte(`
      <div class="cab"><button onclick="window.print()" style="float:right;padding:6px 14px;cursor:pointer">Imprimir / PDF</button>
      <h1>CWG-IA — Informe ${modoN}</h1><p>${perfilN} · ${fecha} · ALB Consultores</p></div>
      ${marked.parse(md)}`);
  };

  const ejecutar = async () => {
    setCargando(true); setError(''); setInforme(''); setMeta('');
    // La pestaña se abre en el clic para evitar bloqueo de popups; el informe se escribe al terminar.
    const w = window.open('', '_blank');
    escribir(w, docReporte(`
      <div style="text-align:center;margin-top:18vh;font-family:Helvetica,Arial,sans-serif">
      <div class="spin"></div><h2 style="color:#722F37;margin:0 0 6px">Generando informe…</h2>
      <p style="color:#8B9AA3;font-size:.9rem">Barriendo fuentes, validando hipótesis y armando el entregable.<br/>Esto toma entre 1 y 4 minutos. No cierre esta pestaña.</p></div>`));
    const filtros: string[] = [];
    if (mercadoSel !== MERCADOS[0] && !mercadoSel.startsWith('Otro')) filtros.push(`Mercado objetivo: ${mercadoSel}`);
    if (canalSel !== CANALES[0]) filtros.push(`Canal objetivo: ${canalSel}`);
    if (cepaSel !== CEPAS[0]) filtros.push(`Cepa/tipo de vino: ${cepaSel}`);
    const consultaFinal = (filtros.length ? `[FILTROS] ${filtros.join(' · ')}\n\n` : '') + consulta;
    try {
      const r = await fetch('/api/agent', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ modo, perfil, consulta: consultaFinal, verificar }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
      setInforme(data.informe_md || '');
      setMeta(`${(data.duracion_ms / 1000).toFixed(0)}s · guardado: ${data.guardado.oportunidades} oportunidades, ${data.guardado.senales} señales, ${data.guardado.ventanas} ventanas`);
      escribir(w, htmlInforme(data.informe_md || ''));
      cargarPipeline();
    } catch (e: any) {
      setError(e?.message || 'Error inesperado');
      escribir(w, docReporte(`
        <div style="text-align:center;margin-top:18vh;font-family:Helvetica,Arial,sans-serif">
        <h2 style="color:#B91C1C">La consulta falló</h2>
        <p style="color:#8B9AA3">${String(e?.message || 'Error inesperado').replace(/</g, '&lt;')}</p>
        <p style="color:#8B9AA3;font-size:.85rem">Vuelva a la app e intente nuevamente.</p></div>`));
    } finally {
      setCargando(false);
    }
  };

  const abrirInforme = () => {
    const w = window.open('', '_blank');
    escribir(w, htmlInforme(informe));
  };

  const cambiarEstado = async (id: string, estado: string) => {
    let causa_muerte: string | undefined;
    if (estado === 'archivada') causa_muerte = prompt('Causa de muerte (reutilizable si cambia la condición):') || undefined;
    await fetch('/api/pipeline', {
      method: 'PATCH', headers: headers(),
      body: JSON.stringify({ tabla: 'oportunidades', id, estado, causa_muerte }),
    });
    cargarPipeline();
  };

  const diasPara = (f?: string) => {
    if (!f) return null;
    return Math.ceil((new Date(f + 'T00:00:00').getTime() - Date.now()) / 86400000);
  };

  const ops = pipeline?.oportunidades ?? [];
  const activas = ops.filter((o: any) => o.estado !== 'archivada');
  const enPiloto = ops.filter((o: any) => o.estado === 'en_piloto');
  const ventanasUrgentes = (pipeline?.ventanas ?? []).filter((v: any) => {
    const d = diasPara(v.fecha_cierre); return d !== null && d <= 30;
  });

  return (
    <div className="flex-1">
      {/* Header */}
      <header className="sticky top-0 z-20 text-white shadow-lg" style={{ background: 'linear-gradient(120deg, #3A1519 0%, #722F37 55%, #46525A 130%)' }}>
        <div className="container mx-auto max-w-6xl px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Image src="/alb-logo.png" alt="ALB Consultores" width={100} height={40} priority />
            <div className="border-l border-white/25 pl-4 min-w-0">
              <h1 className="text-lg font-bold leading-tight tracking-wide">CWG-IA</h1>
              <p className="text-[11px] text-white/70 truncate">Inteligencia comercial · Viñas chilenas exportadoras</p>
            </div>
          </div>
          <input
            type="password" placeholder="Token" value={token} onChange={e => setToken(e.target.value)}
            className="bg-white/10 border border-white/25 rounded-lg px-3 py-1.5 text-xs w-28 placeholder-white/50 focus:outline-none focus:border-white/60"
          />
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Consola del agente */}
        <section className="card p-6 space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.15em] text-alb-mid mb-2.5 font-semibold">Modo de análisis</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {MODOS.map(m => (
                <button key={m.id} onClick={() => setModo(m.id)}
                  className={`text-left rounded-xl border p-3 transition-all duration-150 ${modo === m.id ? 'border-vino bg-[#F7ECEC] shadow-sm' : 'border-gray-200 bg-white hover:border-vino/50'}`}>
                  <span className={`block text-sm font-bold ${modo === m.id ? 'text-vino' : 'text-alb-primary'}`}>{m.nombre}</span>
                  <span className="block text-[11px] leading-snug text-alb-mid mt-1">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t" style={{ borderColor: 'var(--card-border)' }}>
            <p className="text-[11px] uppercase tracking-[0.15em] text-alb-mid font-semibold w-full mt-3 mb-0.5">Tamaño de la viña</p>
            {PERFILES.map(([p, nombre]) => (
              <button key={p} onClick={() => setPerfil(p)}
                className={`chip chip-sm ${perfil === p ? 'chip-orange-on' : 'chip-off'}`}>
                {nombre}
              </button>
            ))}
            <label className="flex items-center gap-2 text-xs text-alb-mid ml-auto cursor-pointer">
              <input type="checkbox" className="accent-[#722F37] w-4 h-4" checked={verificar} onChange={e => setVerificar(e.target.checked)} />
              Verificar en la web
            </label>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.15em] text-alb-mid font-semibold mb-2">Foco del análisis</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={mercadoSel} onChange={e => setMercadoSel(e.target.value)}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer focus:outline-none focus:border-vino">
                {MERCADOS.map(m => <option key={m} value={m}>{m === 'Global' ? 'Mercado: Global' : m}</option>)}
              </select>
              <select value={canalSel} onChange={e => setCanalSel(e.target.value)}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer focus:outline-none focus:border-vino">
                {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={cepaSel} onChange={e => setCepaSel(e.target.value)}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer focus:outline-none focus:border-vino">
                {CEPAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <textarea
            value={consulta} onChange={e => setConsulta(e.target.value)} rows={3}
            placeholder={modo === 'radar' ? 'Opcional: acote el radar (ej: "solo Asia" o "solo NoLo y espumoso"). Vacío = radar global.' : 'Describa el mercado, canal, marca u oferta a evaluar…'}
            className="w-full border border-gray-300 rounded-xl p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#722F37]/30 focus:border-vino bg-[#FBFAF8]"
          />
          <div className="flex items-center gap-4 flex-wrap">
            <button onClick={ejecutar} disabled={cargando} className="btn-primary">
              {cargando ? 'Analizando…' : 'Ejecutar agente'}
            </button>
            {cargando && (
              <span className="flex items-center gap-2 text-xs text-alb-mid">
                <span className="spinner" /> Barriendo fuentes, validando hipótesis… (1-4 min)
              </span>
            )}
            {meta && !cargando && <span className="text-xs text-alb-mid">{meta}</span>}
          </div>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>}
        </section>

        {/* Informe */}
        {informe && (
          <section className="card p-7">
            <div className="flex justify-between items-center mb-4 pb-3 border-b" style={{ borderColor: 'var(--card-border)' }}>
              <h2 className="font-bold text-alb-primary tracking-wide">Informe</h2>
              <button onClick={abrirInforme} className="text-xs font-medium border border-gray-300 rounded-lg px-3.5 py-1.5 hover:border-vino hover:text-vino transition-colors">
                Abrir en pestaña / PDF ↗
              </button>
            </div>
            <div className="informe" dangerouslySetInnerHTML={{ __html: marked.parse(informe) as string }} />
          </section>
        )}

        {/* Resumen del pipeline */}
        {!!ops.length && (
          <div className="flex flex-wrap gap-3">
            <div className="stat-tile"><div className="stat-num">{activas.length}</div><div className="stat-label">Oportunidades activas</div></div>
            <div className="stat-tile"><div className="stat-num">{enPiloto.length}</div><div className="stat-label">En piloto</div></div>
            <div className="stat-tile"><div className="stat-num" style={{ color: ventanasUrgentes.length ? '#B91C1C' : undefined }}>{ventanasUrgentes.length}</div><div className="stat-label">Ventanas ≤30 días</div></div>
            <div className="stat-tile"><div className="stat-num">{pipeline?.senales?.length ?? 0}</div><div className="stat-label">Señales en incubación</div></div>
          </div>
        )}

        {/* Ventanas */}
        {!!pipeline?.ventanas?.length && (
          <section className="card p-6">
            <h2 className="font-bold text-alb-primary mb-4 tracking-wide">Ventanas abiertas</h2>
            <div className="space-y-2">
              {pipeline.ventanas.map((v: any) => {
                const d = diasPara(v.fecha_cierre);
                const urgente = d !== null && d <= 30;
                return (
                  <div key={v.id} className="flex items-center gap-3 text-sm rounded-xl px-3 py-2.5" style={{ background: urgente ? '#FDF2F2' : '#FBFAF8' }}>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${urgente ? 'bg-red-600 text-white' : 'bg-white border text-alb-mid'}`}
                      style={!urgente ? { borderColor: 'var(--card-border)' } : undefined}>
                      {d !== null ? `${d} días` : 's/fecha'}
                    </span>
                    <span className="font-semibold text-alb-primary">{v.entidad}</span>
                    {v.mercado && <span className="text-xs text-alb-mid uppercase tracking-wide">{v.mercado}</span>}
                    <span className="flex-1 truncate text-alb-mid">{v.descripcion}</span>
                    {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="text-vino text-xs underline whitespace-nowrap">fuente ↗</a>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Pipeline */}
        {!!ops.length && (
          <section className="card p-6 overflow-x-auto">
            <h2 className="font-bold text-alb-primary mb-4 tracking-wide">Pipeline de oportunidades</h2>
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-alb-mid border-b" style={{ borderColor: 'var(--card-border)' }}>
                  <th className="py-2 pr-3 font-semibold">Oportunidad</th>
                  <th className="pr-3 font-semibold">Mercado / Canal</th>
                  <th className="pr-3 font-semibold">Palanca</th>
                  <th className="pr-3 font-semibold text-right">Score</th>
                  <th className="pr-3 font-semibold text-right">EBITDA est.</th>
                  <th className="font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ops.map((o: any) => (
                  <tr key={o.id} className="border-b align-top hover:bg-[#FBFAF8] transition-colors" style={{ borderColor: 'var(--card-border)' }}>
                    <td className="py-3 pr-3 max-w-[280px]">
                      <div className="font-semibold text-alb-text leading-snug">{o.titulo}</div>
                      {o.contraparte && <div className="text-xs text-alb-mid mt-0.5">↳ {o.contraparte}</div>}
                      {o.causa_muerte && <div className="text-xs text-red-500 mt-0.5">† {o.causa_muerte}</div>}
                    </td>
                    <td className="pr-3 text-alb-mid">{[o.mercado, o.canal].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="pr-3"><span className="text-xs text-alb-mid">{o.palanca ?? '—'}</span></td>
                    <td className="pr-3 text-right font-bold" style={{ color: (o.score ?? 0) >= 4 ? '#047857' : (o.score ?? 0) >= 3 ? '#B45309' : undefined }}>{o.score ?? '—'}</td>
                    <td className="pr-3 text-right whitespace-nowrap">{o.ebitda_estimado_usd ? `US$ ${Number(o.ebitda_estimado_usd).toLocaleString('es-CL')}` : '—'}</td>
                    <td>
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`badge badge-${o.estado}`}>{String(o.estado).replace('_', ' ')}</span>
                        <select value={o.estado} onChange={e => cambiarEstado(o.id, e.target.value)}
                          className="text-xs border border-gray-300 rounded-lg px-1.5 py-1 bg-white cursor-pointer">
                          {ESTADOS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Señales */}
        {!!pipeline?.senales?.length && (
          <section className="card p-6">
            <h2 className="font-bold text-alb-primary mb-3 tracking-wide">Señales en incubación</h2>
            <ul className="space-y-2 text-sm">
              {pipeline.senales.map((s: any) => (
                <li key={s.id} className="flex gap-2.5 items-baseline">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: '#722F37' }} />
                  <span className="text-alb-text">{s.descripcion}{' '}
                    {s.fuente && <span className="text-xs text-alb-mid">({s.fuente}{s.fecha_dato ? `, ${s.fecha_dato}` : ''})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Estado vacío */}
        {pipeline && !ops.length && !informe && (
          <section className="card p-10 text-center">
            <p className="text-alb-mid text-sm">El pipeline está vacío. Ejecute un <span className="font-semibold text-vino">Radar</span> para generar las primeras oportunidades.</p>
          </section>
        )}
      </main>
    </div>
  );
}
