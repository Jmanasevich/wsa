import { readFileSync } from 'fs';
import path from 'path';

// El prompt maestro vive en prompt-source.md (editable sin tocar código).
let cache: string | null = null;

export function promptMaestro(): string {
  if (cache) return cache;
  const p = path.join(process.cwd(), 'src', 'lib', 'prompt-source.md');
  cache = readFileSync(p, 'utf-8');
  return cache;
}

export const INSTRUCCION_SALIDA_JSON = `
[SALIDA ESTRUCTURADA — OBLIGATORIA AL FINAL]
Después del informe en Markdown, emite EXACTAMENTE un bloque de código JSON (cercado con \`\`\`json) con este esquema. Solo incluye elementos nuevos detectados en ESTA consulta; usa null donde no haya dato; fechas en formato YYYY-MM-DD; montos en USD sin separadores:
{
  "oportunidades": [{ "titulo": "", "hipotesis": "", "palanca": "price_mix|rtm|canal|segmento|granel|arancel|racionalizacion", "mercado": "", "canal": "", "cepa": null, "contraparte": null, "ventana_fecha": null, "margen_caja_usd": null, "ebitda_estimado_usd": null, "score": 0.0, "senales": ["señal fechada 1", "señal fechada 2"], "fuentes": ["url o fuente + fecha"] }],
  "senales": [{ "tipo": "demanda|precio|canal|competidor|regulatoria", "descripcion": "", "mercado": null, "fuente": "", "fecha_dato": null, "proxima_revision": null }],
  "ventanas": [{ "tipo": "tender|plan_compra|feria|private_label", "entidad": "", "mercado": null, "descripcion": "", "fecha_cierre": null, "url": null }]
}
Contrapartes solo verificables (regla anti-patrones): si no hay nombre con fuente, deja contraparte en null y describe el perfil en la hipótesis.`;
