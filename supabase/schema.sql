-- CWG-IA — esquema Supabase
-- Ejecutar en SQL Editor. RLS queda en deny-all: solo la service key del servidor accede.

create table if not exists oportunidades (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  modo text not null default 'radar',            -- radar | deep_dive | deal | defensa
  titulo text not null,
  hipotesis text,                                 -- "vender X en Y a Z a precio P captura M porque S"
  palanca text,                                   -- price_mix|rtm|canal|segmento|granel|arancel|racionalizacion
  mercado text,
  canal text,
  cepa text,
  contraparte text,
  ventana_fecha date,
  margen_caja_usd numeric,
  ebitda_estimado_usd numeric,
  score numeric,
  estado text not null default 'nueva',           -- nueva|validada|en_piloto|ejecutada|archivada
  causa_muerte text,
  senales jsonb default '[]'::jsonb,
  fuentes jsonb default '[]'::jsonb,
  informe_md text
);

create table if not exists senales (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  tipo text,                                      -- demanda|precio|canal|competidor|regulatoria
  descripcion text not null,
  mercado text,
  fuente text,
  fecha_dato date,
  estado text not null default 'incubacion',      -- incubacion|usada|descartada
  proxima_revision date
);

create table if not exists ventanas (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  tipo text,                                      -- tender|plan_compra|feria|private_label
  entidad text not null,
  mercado text,
  descripcion text,
  fecha_cierre date,
  url text,
  estado text not null default 'abierta'          -- abierta|aprovechada|vencida
);

create table if not exists consultas (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  modo text,
  perfil text,
  consulta text,
  informe_md text,
  tokens_in int,
  tokens_out int,
  duracion_ms int
);

create table if not exists conocimiento (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  tipo text not null default 'nota',              -- exportaciones|sell_out|precios|informe_pagado|benchmark|nota
  titulo text not null,
  contenido text not null,
  mercado text,
  cepa text,
  fuente text,
  fecha_dato date,
  activo boolean not null default true
);
create index if not exists idx_conocimiento_activo on conocimiento(activo, fecha_dato);
alter table conocimiento enable row level security;

create table if not exists vinas (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  nombre text not null unique,
  perfil text not null default 'B',               -- A grande | B mediana | C boutique
  pais text not null default 'Chile',
  activo boolean not null default true
);
alter table vinas enable row level security;

create table if not exists embarques (
  id bigint generated always as identity primary key,
  periodo text not null,                          -- 'YYYYMM' (M) o 'YYYY' (A)
  freq text not null default 'M',
  partida text not null,                          -- 220410|220421|220422|220429
  mercado text not null,                          -- nombre Comtrade en inglés; 'World' = total
  volumen_l numeric,
  valor_usd numeric,
  fuente text not null default 'UN Comtrade',
  unique(periodo, partida, mercado)
);
create index if not exists idx_embarques_mercado on embarques(mercado, periodo);
alter table embarques enable row level security;

create table if not exists fuentes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  tipo text not null,                             -- lider_opinion|concurso|feria|gremio|monopolio|dato|prensa
  nombre text not null,
  mercado text not null default 'Global',
  url text,
  descripcion text,
  activo boolean not null default true,
  unique(nombre, mercado)
);
alter table fuentes enable row level security;

create index if not exists idx_oportunidades_estado on oportunidades(estado);
create index if not exists idx_ventanas_cierre on ventanas(estado, fecha_cierre);
create index if not exists idx_senales_estado on senales(estado, proxima_revision);

alter table oportunidades enable row level security;
alter table senales enable row level security;
alter table ventanas enable row level security;
alter table consultas enable row level security;
-- Sin policies: deny-all para anon/authenticated; la service key del servidor bypassa RLS.
