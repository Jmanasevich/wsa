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
  (r'CONCHA Y TORO|CASILLERO DEL DIABLO|DON MELCHOR|MARQUES DE CASA CONCHA|TERRUNYO|AMELIA|CARMIN DE PEUMO|GRAN RESERVA SERIE RIBERAS|SUNRISE|FRONTERA|DIABLO\\b|VINA MAIPO|CLOS DE PIRQUE|EXPORTADORA VINA CONCHA', 'Concha y Toro'),
  (r'CONO ?SUR|ISLA NEGRA|TOCORNAL', 'Cono Sur'),
  (r'TRIVENTO', 'Trivento (CyT)'),
  (r'VINA SAN PEDRO|GATO NEGRO|GATO\\b|1865|CASTILLO DE MOLINA|CABO DE HORNOS|35 SUR|35SUR|EPICA|DEL PEDREGAL 35', 'VSPT (San Pedro-Tarapaca)'),
  (r'TARAPACA|GRAN TARAPACA', 'VSPT (San Pedro-Tarapaca)'),
  (r'SANTA HELENA|VERAMONTE|PRIMUS', 'VSPT (San Pedro-Tarapaca)'),
  (r'MISIONES DE RENGO', 'VSPT (San Pedro-Tarapaca)'),
  (r'VINAMAR|CASA RIVAS|LEYDA|ALTAIR|SIDERAL', 'VSPT (San Pedro-Tarapaca)'),
  (r'SANTA RITA|CASA REAL|MEDALLA REAL|FLORESTA|SECRET RESERVE|\\b120\\b|VINO 120|SANTA RITA 120', 'Santa Rita'),
  (r'\\bCARMEN\\b|GRAN RESERVA CARMEN|SANTA CAROLINA CARMEN', 'Santa Rita'),
  (r'SUR ANDINO|TERRA ANDINA|NATIVA', 'Santa Rita'),
  (r'SANTA CAROLINA|OCHAGAVIA|VSC|RESERVA DE FAMILIA SANTA|HERENCIA SANTA', 'Santa Carolina'),
  (r'ERRAZURIZ|DON MAXIMIANO|KAI\\b|LA CUMBRE|ACONCAGUA COSTA|MAX RESERVA', 'Errazuriz'),
  (r'CALITERRA|TRIBUTO CALITERRA', 'Errazuriz'),
  (r'ARBOLEDA', 'Errazuriz'),
  (r'\\bSENA\\b', 'Errazuriz'),
  (r'VINEDO CHADWICK', 'Errazuriz'),
  (r'LUIS FELIPE EDWARDS|\\bLFE\\b|MAREA|GRAN TORO|PUPILLE', 'Luis Felipe Edwards'),
  (r'\\bMONTES\\b|MONTES ALPHA|PURPLE ANGEL|MONTES FOLLY|OUTER LIMITS|MONTES TWINS', 'Montes'),
  (r'KAIKEN', 'Montes (Kaiken)'),
  (r'UNDURRAGA|SIBARIS|ALIWEN|\\bTH\\b TERROIR|FOUNDERS COLLECTION|VINO TH ', 'Undurraga'),
  (r'EMILIANA|COYAM|SIGNOS DE ORIGEN|\\bNOVAS\\b|\\bADOBE\\b|\\bGE\\b ORGANIC', 'Emiliana'),
  (r'MIGUEL TORRES|SANTA DIGNA|MANSO DE VELASCO|CORDILLERA DE|LAS MULAS', 'Miguel Torres Chile'),
  (r'VENTISQUERO|\\bGREY\\b|VERTICE|ENCLAVE|PANGEA|\\bYALI\\b|ROOT ?1|KALFU|QUEULAT', 'Ventisquero'),
  (r'INDOMITA', 'Indomita'),
  (r'VALDIVIESO|CABALLO LOCO|\\bECLAT\\b', 'Valdivieso'),
  (r'MORANDE|HOUSE OF MORANDE|VINO MORANDE', 'Morande'),
  (r'CASA SILVA|COOL COAST|MICROTERROIR', 'Casa Silva'),
  (r'VIU MANENT|SECRETO VIU|\\bVIU 1\\b', 'Viu Manent'),
  (r'LAPOSTOLLE|CLOS APALTA|CASA LAPOSTOLLE|CUVEE ALEXANDRE', 'Lapostolle'),
  (r'DE MARTINO|VIEJAS TINAJAS|GALLARDIA', 'De Martino'),
  (r'\\bKOYLE\\b|ROYALE KOYLE|COSTA KOYLE|CERRO BASALTO', 'Koyle'),
  (r'GARCES SILVA|\\bAMAYNA\\b|BOYA\\b', 'Garces Silva (Amayna)'),
  (r'CASAS DEL BOSQUE|PEQUENAS PRODUCCIONES BOSQUE|GRAN RESERVA BOSQUE', 'Casas del Bosque'),
  (r'MATETIC|\\bEQ\\b MATETIC|CORRALILLO', 'Matetic'),
  (r'\\bMAQUIS\\b|VINA MAQUIS|\\bLIEN\\b|\\bFRANCO\\b MAQUIS|CALCU', 'Maquis'),
  (r'PEREZ CRUZ|LIGUAI|QUELEN', 'Perez Cruz'),
  (r'\\bBOUCHON\\b|PAIS SALVAJE|GRANITO BOUCHON', 'Bouchon'),
  (r'\\bARESTI\\b|TRISQUEL|BELLAVISTA ARESTI', 'Aresti'),
  (r'REQUINGUA|TORO DE PIEDRA|POTRO DE PIEDRA|PUEBLO DEL SOL', 'Requinga'),
  (r'SANTA EMA|AMPLUS|RIVALTA', 'Santa Ema'),
  (r'BODEGAS? AGUIRRE|VINA AGUIRRE', 'Bodegas Aguirre'),
  (r'SUR ?VALLES', 'Sur Valles'),
  (r'SANTA ALICIA', 'Santa Alicia'),
  (r'BARON PHILIPPE|ESCUDO ROJO', 'Baron Philippe de R.'),
  (r'COUSINO MACUL|ANTIGUAS RESERVAS|FINIS TERRAE|\\bLOTA\\b', 'Cousino Macul'),
  (r'TERRAMATER|ALTUM|UNITISERRA', 'TerraMater'),
  (r'ANAKENA|\\bONA\\b ANAKENA|ENCO', 'Anakena'),
  (r'\\bSIEGEL\\b|CREW SIEGEL|SINGLE VINEYARD SIEGEL', 'Siegel'),
  (r'\\bTABALI\\b|TALINAY|VETAS BLANCAS', 'Tabali'),
  (r'\\bTAMAYA\\b', 'Tamaya'),
  (r'MONTGRAS|NINQUEN|\\bANTU\\b|\\bAMARAL\\b|QUATRO', 'MontGras'),
  (r'ODFJELL|ORZADA|ALIARA', 'Odfjell'),
  (r'\\bFALERNIA\\b', 'Falernia'),
  (r'HARAS DE PIRQUE|CHARACTER HARAS', 'Haras de Pirque'),
  (r'WILLIAM FEVRE', 'William Fevre Chile'),
  (r'\\bCHOCALAN\\b', 'Chocalan'),
  (r'CARTA VIEJA', 'Carta Vieja'),
  (r'\\bEL AROMO\\b|DOBLE ESTRELLA', 'El Aromo'),
  (r'CASA DONOSO|DONOSO RESERVA', 'Casa Donoso'),
  (r'VISTAMAR|SEPIA VISTAMAR', 'Vistamar'),
  (r'CORPORA|GRACIA DE CHILE|VERANDA', 'Corpora'),
  (r'AGUSTINOS', 'Agustinos'),
  (r'BOTALCURA|\\bLA PORFIA\\b', 'Botalcura'),
  (r'ANTIYAL|ESCORIAL ANTIYAL|KUYEN', 'Antiyal'),
  (r'LA CAUSA|GARAGE WINE|\\bBRAVADO\\b', 'La Causa'),
  (r'POLKURA', 'Polkura'),
  (r'KINGSTON FAMILY|\\bTOBIANO\\b', 'Kingston Family'),
  (r'VENTOLERA|\\bLITORAL\\b VENTOLERA', 'Ventolera'),
  (r'RAVANAL', 'Ravanal'),
  (r'ATTILIO|MOCHI', 'Attilio & Mochi'),
  (r'MI PUEBLO', 'Mi Pueblo (granel/BIB)'),
  (r'PATACON', 'Patacon'),
  (r'\\bG7\\b|7TH GENERATION|GENERATION 7|VINA DEL PEDREGAL', 'Del Pedregal (G7)'),
  (r'AVES DEL SUR|\\bVICO\\b', 'Aves del Sur'),
  (r'OVEJA NEGRA|LA RONCIERE|RONCIERE', 'La Ronciere (Oveja Negra)'),
  (r'\\bANTARES\\b', 'Antares (marca)'),
  (r'CENTENARIA', 'Centenaria (marca)'),
  (r'URCELAY', 'Urcelay'),
  (r'ANTAWARA', 'Antawara'),
  (r'MONTANERO', 'Montanero (marca)'),
  (r'MARIA LEGACY|MARIA PINTO', 'Maria Legacy (marca)'),
  (r'HERENCIA\\b', 'Herencia (marca)'),
  (r'CARMEN\\bLEGACY', 'Santa Rita'),
  (r'ALMAVIVA', 'Almaviva'),
  (r'\\bVSPT\\b|\\bALPACA\\b|ROSALEDA|\\bEPICA\\b', 'VSPT (San Pedro-Tarapaca)'),
  (r'\\bLOURDES\\b', 'Lourdes (marca)'),
  (r'CASA DE ORO|CASA DEL ORO', 'Casa de Oro (marca)'),
  (r'TRES PALACIOS', 'Tres Palacios'),
  (r'LA ROSA\\b|LA PALMERIA|LA PALMER', 'La Rosa (La Palmeria)'),
  (r'VINA MAR|VINAMAR', 'Vinamar'),
  (r'CREMASCHI|FURLOTTI', 'Cremaschi Furlotti'),
  (r'\\bTABONTINAJA\\b|GILLMORE', 'Gillmore'),
  (r'\\bLOMAS DE CAUQUENES|LOMAS ', 'Lomas de Cauquenes'),
  (r'SANTA LAURA', 'Santa Laura'),
  (r'\\bLUIS\\b FELIPE', 'Luis Felipe Edwards'),
  (r'\\bSANTA ISABEL\\b', 'Santa Isabel'),
  (r'\\bTERRANOBLE\\b|TERRA NOBLE', 'TerraNoble'),
  (r'\\bDANTES\\b|DANTE', 'Dante (marca)'),
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
