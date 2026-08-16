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

create index if not exists idx_oportunidades_estado on oportunidades(estado);
create index if not exists idx_ventanas_cierre on ventanas(estado, fecha_cierre);
create index if not exists idx_senales_estado on senales(estado, proxima_revision);

alter table oportunidades enable row level security;
alter table senales enable row level security;
alter table ventanas enable row level security;
alter table consultas enable row level security;
-- Sin policies: deny-all para anon/authenticated; la service key del servidor bypassa RLS.
