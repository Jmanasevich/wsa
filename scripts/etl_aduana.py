#!/usr/bin/env python3
"""
WSA - ETL de embarques de vino chileno por vina (Aduana / datos.gob.cl).
Descarga los registros de exportacion mensuales, filtra vino (HS 2204), mapea la
vina por el texto de la descripcion, agrega por vina x mercado x formato y hace upsert
a la app via /api/aduana. Reutilizable para ACTUALIZAR: correr con el/los periodos nuevos.

Uso:
  pip install requests
  # instalar unrar (apt-get install unrar / brew install rar)
  export CWGIA_URL=https://wsa.vercel.app
  export CRON_SECRET=<el mismo de Vercel>
  python etl_aduana.py 2026-01 2026-02      # sin args = ultimo mes publicado (rezago 3 meses)
"""
import os, re, sys, subprocess, unicodedata, requests
from collections import defaultdict

APP = os.environ["CWGIA_URL"].rstrip("/")
SECRET = os.environ["CRON_SECRET"]
UA = {"User-Agent": "Mozilla/5.0"}
MES = {'01':'enero','02':'febrero','03':'marzo','04':'abril','05':'mayo','06':'junio',
       '07':'julio','08':'agosto','09':'septiembre','10':'octubre','11':'noviembre','12':'diciembre'}
FMT = {'220410':'espumoso','220421':'embotellado','220422':'BiB','220429':'granel'}

VINAS = [
  (r'CONCHA Y TORO|CONO SUR|CONOSUR|TRIVENTO','Concha y Toro'),
  (r'SAN PEDRO|TARAPACA|SANTA HELENA|MISIONES DE RENGO|VSPT|VINA SAN PEDRO','VSPT (San Pedro-Tarapaca)'),
  (r'SANTA RITA|CARMEN|SUR ANDINO','Santa Rita'),(r'SANTA CAROLINA|OCHAGAVIA','Santa Carolina'),
  (r'ERRAZURIZ|CALITERRA|ARBOLEDA|SENA','Errazuriz'),(r'LUIS FELIPE EDWARDS|LFE','Luis Felipe Edwards'),
  (r'MONTES','Montes'),(r'UNDURRAGA','Undurraga'),(r'EMILIANA|NOVAS','Emiliana'),
  (r'MIGUEL TORRES','Miguel Torres Chile'),(r'VENTISQUERO','Ventisquero'),(r'INDOMITA','Indomita'),
  (r'VALDIVIESO','Valdivieso'),(r'MORANDE','Morande'),(r'CASA SILVA','Casa Silva'),(r'VIU MANENT','Viu Manent'),
  (r'LAPOSTOLLE','Lapostolle'),(r'DE MARTINO','De Martino'),(r'KOYLE','Koyle'),(r'GARCES SILVA|AMAYNA','Garces Silva (Amayna)'),
  (r'CASAS DEL BOSQUE','Casas del Bosque'),(r'MATETIC','Matetic'),(r'MAQUIS','Maquis'),(r'PEREZ CRUZ','Perez Cruz'),
  (r'BOUCHON','Bouchon'),(r'ARESTI','Aresti'),(r'REQUINGUA|POTRO DE PIEDRA|TORO DE PIEDRA','Requinga'),(r'SANTA EMA','Santa Ema'),
  (r'BODEGAS? AGUIRRE','Bodegas Aguirre'),(r'SUR VALLES|SURVALLES','Sur Valles'),(r'SANTA ALICIA','Santa Alicia'),
  (r'BARON PHILIPPE|ESCUDO ROJO','Baron Philippe de R.'),
]
PAT = [(re.compile(p), n) for p, n in VINAS]
def norm(s): return re.sub(r'[^A-Z0-9 ]',' ', unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode().upper())
def match_vina(txt):
    t = norm(txt)
    for rx, nom in PAT:
        if rx.search(t): return nom
    return None
def num(x):
    try: return float((x or '').replace(',', '.'))
    except: return 0.0

def url_mes(periodo):
    anio, mm = periodo[:4], periodo[4:]
    ds = requests.get("https://datos.gob.cl/api/3/action/package_show?id=registro-de-exportaciones-"+anio, headers=UA, timeout=60).json()
    for r in ds["result"]["resources"]:
        nm = r["name"].lower()
        if MES[mm] in nm and "exportacion" in nm and not any(w in nm for w in ["bulto","dtran","metadata","tran"]):
            return r["url"]
    raise SystemExit("No encontre recurso para "+periodo)

def etl(periodo):
    url = url_mes(periodo)
    rar = "/tmp/"+periodo+".rar"
    open(rar, "wb").write(requests.get(url, headers=UA, timeout=300).content)
    os.makedirs("/tmp/cwgexp", exist_ok=True)
    subprocess.run(["unrar","x","-o+",rar,"/tmp/cwgexp/"], check=True, capture_output=True)
    txt = [f for f in os.listdir("/tmp/cwgexp") if f.endswith(".txt")][0]
    agg = defaultdict(lambda: {"fob":0.0,"lit":0.0})
    with open("/tmp/cwgexp/"+txt, encoding="latin-1") as f:
        for line in f:
            r = line.rstrip("\n").split(";")
            if len(r) < 84 or not r[69].startswith("2204"): continue
            v = match_vina(" ".join(r[62:69]))
            if not v: continue
            k = (v, r[20].strip().title(), FMT.get(r[69][:6], r[69][:6]))
            agg[k]["fob"] += num(r[73]); agg[k]["lit"] += num(r[71])
    os.remove(rar); os.remove("/tmp/cwgexp/"+txt)
    return [{"periodo":periodo,"vina":v,"mercado":m,"formato":fmt,"volumen_l":x["lit"],"valor_usd":x["fob"]}
            for (v,m,fmt),x in agg.items()]

def periodos_default():
    from datetime import date
    hoy = date.today(); y, mth = hoy.year, hoy.month - 3
    if mth <= 0: y -= 1; mth += 12
    return ["%d%02d" % (y, mth)]

if __name__ == "__main__":
    args = sys.argv[1:] or periodos_default()
    for a in args:
        periodo = a.replace("-", "")
        filas = etl(periodo)
        r = requests.post(APP+"/api/aduana", headers={"Authorization": "Bearer "+SECRET}, json={"filas": filas}, timeout=300)
        print(periodo, "->", len(filas), "filas vina |", r.status_code, r.text[:120])
