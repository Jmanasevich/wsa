'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { marked } from 'marked';

type Modo = 'radar' | 'deep_dive' | 'deal' | 'defensa';

const MODOS: { id: Modo; nombre: string; hint: string }[] = [
  { id: 'radar', nombre: 'Radar', hint: 'Barrido global: 3-5 movimientos priorizados' },
  { id: 'deep_dive', nombre: 'Deep-Dive', hint: 'Mercado/canal/marca: waterfall + plan de entrada' },
  { id: 'deal', nombre: 'Deal', hint: 'Evaluar oferta/tender: aceptar, contraofertar o rechazar' },
  { id: 'defensa', nombre: 'Defensa', hint: 'Dónde estamos perdiendo share o margen y por qué' },
];

const ESTADOS = ['nueva', 'validada', 'en_piloto', 'ejecutada', 'archivada'];

export default function Home() {
  const [modo, setModo] = useState<Modo>('radar');
  const [perfil, setPerfil] = useState<'A' | 'B'>('A');
  const [verificar, setVerificar] = useState(true);
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

  const ejecutar = async () => {
    setCargando(true); setError(''); setInforme(''); setMeta('');
    try {
      const r = await fetch('/api/agent', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ modo, perfil, consulta, verificar }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
      setInforme(data.informe_md || '');
      setMeta(`${(data.duracion_ms / 1000).toFixed(0)}s · guardado: ${data.guardado.oportunidades} oportunidades, ${data.guardado.senales} señales, ${data.guardado.ventanas} ventanas`);
      cargarPipeline();
    } catch (e: any) {
      setError(e?.message || 'Error inesperado');
    } finally {
      setCargando(false);
    }
  };

  const abrirInforme = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>CWG-IA — Informe</title>
      <style>body{font-family:Georgia,serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#2C3A42;line-height:1.55}
      h1,h2,h3{color:#722F37}table{border-collapse:collapse;width:100%;font-size:.9rem}th{background:#46525A;color:#fff;text-align:left;padding:6px}
      td{border-bottom:1px solid #ddd;padding:6px;vertical-align:top}@media print{button{display:none}}</style></head>
      <body><button onclick="window.print()" style="float:right;padding:6px 14px">Imprimir / PDF</button>
      ${marked.parse(informe)}</body></html>`);
    w.document.close();
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

  return (
    <div className="flex-1">
      <header className="bg-alb-primary text-white shadow-lg">
        <div className="container mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image src="/alb-logo.png" alt="ALB Consultores" width={110} height={44} priority />
            <div>
              <h1 className="text-lg font-bold leading-tight">CWG-IA</h1>
              <p className="text-xs text-gray-300">Inteligencia comercial para viñas chilenas exportadoras</p>
            </div>
          </div>
          <input
            type="password" placeholder="Token" value={token} onChange={e => setToken(e.target.value)}
            className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs w-24 placeholder-gray-400"
          />
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Consola del agente */}
        <section className="bg-white rounded-xl shadow p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {MODOS.map(m => (
              <button key={m.id} onClick={() => setModo(m.id)} title={m.hint}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${modo === m.id ? 'bg-vino text-white border-vino' : 'bg-white text-alb-primary border-gray-300 hover:border-vino'}`}>
                {m.nombre}
              </button>
            ))}
            <span className="mx-2 border-l border-gray-200" />
            {(['A', 'B'] as const).map(p => (
              <button key={p} onClick={() => setPerfil(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${perfil === p ? 'bg-alb-orange text-white border-alb-orange' : 'bg-white text-alb-primary border-gray-300'}`}>
                {p === 'A' ? 'Perfil A · Tier-1' : 'Perfil B · Viña media'}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-alb-mid ml-auto cursor-pointer">
              <input type="checkbox" checked={verificar} onChange={e => setVerificar(e.target.checked)} />
              Verificar en la web
            </label>
          </div>
          <p className="text-xs text-alb-mid">{MODOS.find(m => m.id === modo)?.hint}</p>
          <textarea
            value={consulta} onChange={e => setConsulta(e.target.value)} rows={3}
            placeholder={modo === 'radar' ? 'Opcional: acote el radar (ej: "solo Asia" o "solo NoLo y espumoso"). Vacío = radar global.' : 'Describa el mercado, canal, marca u oferta a evaluar…'}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:border-vino"
          />
          <div className="flex items-center gap-3">
            <button onClick={ejecutar} disabled={cargando}
              className="bg-vino hover:bg-vino-deep text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-50">
              {cargando ? 'Analizando…' : 'Ejecutar agente'}
            </button>
            {cargando && <span className="text-xs text-alb-mid animate-pulse">Barriendo fuentes, validando hipótesis… (1-4 min)</span>}
            {meta && !cargando && <span className="text-xs text-alb-mid">{meta}</span>}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}
        </section>

        {/* Informe */}
        {informe && (
          <section className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-bold text-alb-primary">Informe</h2>
              <button onClick={abrirInforme} className="text-xs border border-gray-300 rounded px-3 py-1 hover:border-vino">
                Abrir en pestaña / PDF
              </button>
            </div>
            <div className="informe text-sm" dangerouslySetInnerHTML={{ __html: marked.parse(informe) as string }} />
          </section>
        )}

        {/* Ventanas por cerrar */}
        {!!pipeline?.ventanas?.length && (
          <section className="bg-white rounded-xl shadow p-5">
            <h2 className="font-bold text-alb-primary mb-3">Ventanas abiertas</h2>
            <div className="space-y-1.5">
              {pipeline.ventanas.map((v: any) => {
                const d = diasPara(v.fecha_cierre);
                return (
                  <div key={v.id} className="flex items-center gap-3 text-sm border-b border-gray-100 pb-1.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${d !== null && d <= 30 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-alb-mid'}`}>
                      {d !== null ? `${d} días` : 's/fecha'}
                    </span>
                    <span className="font-medium">{v.entidad}</span>
                    <span className="text-alb-mid">{v.mercado}</span>
                    <span className="flex-1 truncate text-alb-mid">{v.descripcion}</span>
                    {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="text-vino text-xs underline">fuente</a>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Pipeline */}
        {!!pipeline?.oportunidades?.length && (
          <section className="bg-white rounded-xl shadow p-5 overflow-x-auto">
            <h2 className="font-bold text-alb-primary mb-3">Pipeline de oportunidades</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-alb-mid border-b">
                  <th className="py-1.5 pr-2">Oportunidad</th><th className="pr-2">Mercado/Canal</th>
                  <th className="pr-2">Palanca</th><th className="pr-2">Score</th><th className="pr-2">EBITDA est.</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.oportunidades.map((o: any) => (
                  <tr key={o.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{o.titulo}</div>
                      {o.contraparte && <div className="text-xs text-alb-mid">↳ {o.contraparte}</div>}
                      {o.causa_muerte && <div className="text-xs text-red-500">† {o.causa_muerte}</div>}
                    </td>
                    <td className="pr-2 text-alb-mid">{[o.mercado, o.canal].filter(Boolean).join(' / ')}</td>
                    <td className="pr-2 text-alb-mid">{o.palanca}</td>
                    <td className="pr-2 font-semibold">{o.score ?? '—'}</td>
                    <td className="pr-2">{o.ebitda_estimado_usd ? `US$ ${Number(o.ebitda_estimado_usd).toLocaleString('es-CL')}` : '—'}</td>
                    <td>
                      <select value={o.estado} onChange={e => cambiarEstado(o.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-1 py-0.5">
                        {ESTADOS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Señales en incubación */}
        {!!pipeline?.senales?.length && (
          <section className="bg-white rounded-xl shadow p-5">
            <h2 className="font-bold text-alb-primary mb-3">Señales en incubación</h2>
            <ul className="space-y-1 text-sm text-alb-mid">
              {pipeline.senales.map((s: any) => (
                <li key={s.id}>· <span className="text-alb-text">{s.descripcion}</span> {s.fuente && <span className="text-xs">({s.fuente}{s.fecha_dato ? `, ${s.fecha_dato}` : ''})</span>}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
