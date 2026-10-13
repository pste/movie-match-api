# movie-match-api

API REST di movie-match: FastAPI + psycopg 3 (pool async), SQL scritta a mano.
È l'unico componente che parla col database.

## Setup

```bash
uv venv .venv --python 3.12
uv pip install --python .venv -r requirements-dev.txt
cp .env.dist .env      # stesse credenziali di movie-match-db/.env
```

Lo schema lo crea `movie-match-db` (`node app.js -e local up`).

## Uso

```bash
# dev server, con reload
.venv/bin/uvicorn app.main:app --port 8000 --reload

# test: girano contro il Postgres di .env e cancellano i film che creano
.venv/bin/python -m pytest -q
```

Documentazione OpenAPI su `http://localhost:8000/api/docs`.

## Rotte

| Metodo | Percorso | |
|---|---|---|
| GET | `/api/health` | probe k8s, non tocca il DB |
| GET | `/api/imdb/search?q=` | cerca film su IMDb: `{imdb_id, title, year, poster_url, director}` |
| GET | `/api/users` | utenti, con film candidati e visti |
| POST | `/api/users` | aggiunge `{name}`; 409 se il nome esiste già (senza distinzione di maiuscole) |
| PUT | `/api/users/{id}` | rinomina `{name}` |
| DELETE | `/api/users/{id}` | elimina; 409 se ha dei film |
| GET | `/api/movies` | lista film, con `user_name` di chi l'ha proposto |
| POST | `/api/movies` | aggiunge un risultato della ricerca IMDb più `user_id` (obbligatorio); 409 se è già fra i da vedere; un film già visto entra come riga nuova |
| PUT | `/api/movies/{id}` | modifica note e utente `{notes, user_id}`; il resto viene da IMDb |
| PUT | `/api/movies/{id}/watched` | `{watched: bool}` |
| DELETE | `/api/movies/{id}` | elimina |
| POST | `/api/draw` | estrazione equa fra i non visti `{genre, user_id}` (filtri facoltativi); 409 se non c'è niente |
| GET | `/api/draw/odds?genre=&user_id=` | probabilità attuale di ogni utente all'estrazione, con gli stessi filtri |
| GET | `/api/picks` | ultime estrazioni (`?limit=20`) |

## Script

```bash
# completa i generi IMDb dei film che non ne hanno (dopo la migration imdbGenres);
# idempotente, si puo' rilanciare
.venv/bin/python -m app.backfill_genres
```

## Scelte

- **Estrazione equa, casuale pesata** (`dbmodels/picks.py`). Fra gli utenti che hanno almeno
  un candidato (col filtro di genere), ognuno pesa `1 / (1 + suoi film già visti)`; si estrae
  l'utente secondo il peso, poi un suo film a caso. Quanti film uno propone non conta. I film
  senza utente (nati prima degli utenti) fanno un gruppo a sé. `/api/draw/odds` usa la stessa
  CTE, quindi le probabilità mostrate sono quelle vere; un test fa 300 estrazioni e controlla
  che la frequenza segua il peso.

- **IMDb via l'API GraphQL del sito** (`app/imdb.py`), non un'API pubblica: niente chiave, ma
  è consentita solo per uso limitato e non commerciale, e può cambiare senza preavviso. Senza gli
  header `Origin` e `x-imdb-client-name` risponde 403. Una chiamata dà titolo in italiano, anno,
  locandina (ridimensionata a 300 px dal CDN) e regista, solo film. Se IMDb non risponde la
  ricerca dà 502; la lista no, perché i dati del film scelto si salvano nel database.

- **Nessun login**: una lista sola, aperta a chiunque raggiunga l'app. Va bene in
  LAN/Tailscale; esposta su internet chiunque potrebbe modificare la lista.
- **Estrazione in un'unica istruzione SQL** (CTE `ORDER BY random() LIMIT 1` + `INSERT` nello
  storico): niente transazione esplicita da gestire.
- **Niente CORS**: in produzione UI e API stanno sullo stesso host dietro l'ingress, in
  sviluppo il proxy di Vite fa lo stesso.

## Immagine

```bash
docker build -f .docker/Dockerfile -t pirraste/movie-match-api:v0.1.0 .
```

Gira come uid 1000 sulla porta 8000.
