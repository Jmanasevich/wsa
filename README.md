# WSA — Wine Sales Assistant

Agente comercial autónomo para viñas chilenas exportadoras. Detecta oportunidades de negocio (mercados, canales, tenders, private label), las valida con price waterfall y matriz de priorización, y mantiene un pipeline vivo con memoria entre consultas.

**Stack**: Next.js 14 (App Router) · Claude (Anthropic API + web search) · Supabase (Postgres) · Vercel (región gru1).

## Arquitectura

- `src/lib/prompt-source.md` — prompt maestro del agente (editable sin tocar código).
- `src/lib/agent.ts` — motor: arma contexto desde Supabase (pipeline, ventanas, señales), llama a Claude con `web_search`, extrae el bloque JSON estructurado del informe y lo persiste.
- `/api/agent` (POST, maxDuration 300) — `{ modo: radar|deep_dive|deal|defensa, consulta, perfil: A|B, verificar: bool }`.
- `/api/pipeline` (GET/PATCH) — lectura del pipeline y cambio de estado (archivar exige causa de muerte).
- `/api/cron` (GET, diario 11:00 UTC) — marca ventanas vencidas y genera alertas de cierres ≤30 días.
- `supabase/schema.sql` — tablas `oportunidades`, `senales`, `ventanas`, `consultas`. RLS deny-all: solo la service key del servidor accede; el navegador nunca toca Supabase.

## Variables de entorno (Vercel)

| Variable | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | llave de Anthropic |
| `CWGIA_MODEL` | `claude-sonnet-4-6` (opcional, default) |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` |
| `APP_ACCESS_TOKEN` | token de acceso (opcional; si se define, la UI pide token) |
| `CRON_SECRET` | secreto para el cron (Vercel lo envía como Bearer automáticamente) |

## Uso

- **Radar** (vacío = global): ranking de 3-5 movimientos con score y contraparte.
- **Deep-Dive**: "Sauvignon Blanc costero en Canadá vía LCBO" → waterfall, competencia, plan.
- **Deal**: pegar la oferta del importador/tender → aceptar, contraofertar o rechazar con número.
- **Defensa**: "¿dónde estamos perdiendo margen en UK?" → competidor y mecanismo.

Cada consulta guarda oportunidades, señales y ventanas en el pipeline; la siguiente consulta parte de ese estado. Las ventanas que cierran en ≤30 días se reportan siempre.

---
© ALB Consultores SpA

<!-- redeploy trigger tras GitHub outage 2026-08-17 -->
