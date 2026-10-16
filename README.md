# movie-match-api

API REST di movie-match: Node.js 24 + Fastify 5 + pg, SQL scritta a mano. Stesso impianto di
photovault-api. È l'unico componente che parla col database.

## Setup

```bash
npm install
cp .env.dist .env      # stesse credenziali di movie-match-db/.env
```

Lo schema lo crea `movie-match-db` (`node app.js -e local up`).

## Uso

```bash
# dev server su :8000, si riavvia quando cambia un file
npm run dev

# test (node:test): girano contro il Postgres di .env e cancellano quello che creano
npm test
```

`.env` lo legge Node stesso (`--env-file-if-exists`): niente dotenv. In produzione le variabili
arrivano dal pod.

## Struttura

```
app.js                  # avvia il server, o uno script (backfill-genres)
src/server.js           # Fastify: hook, gestione errori, registrazione delle rotte
src/routes/*.js         # le rotte, un file per risorsa
src/schemas.js          # schemi JSON di body, querystring e parametri
src/dbmodels/*.js       # la SQL, un file per tabella
src/db.js               # pool pg
src/imdb.js             # ricerca IMDb
tests/*.test.js
```

## Rotte

| Metodo | Percorso | |
|---|---|---|
| GET | `/api/health` | probe k8s, non tocca il DB |
| GET | `/api/imdb/search?q=` | cerca film su IMDb: `{imdb_id, title, year, poster_url, director, genres}` |
| GET | `/api/imdb/{imdb_id}/platforms` | dove il film è in abbonamento adesso, fra Netflix, Disney+, Prime Video e Crunchyroll: `[{name, logo_url, link}]`; 502 se IMDb non risponde |
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

Gli errori sono `{detail}`: una stringa per quelli dell'applicazione, una lista per i dati non
validi (422).

## Script

```bash
# completa i generi IMDb dei film che non ne hanno (dopo la migration imdbGenres);
# idempotente, si puo' rilanciare
npm run backfill-genres
```

## Scelte

- **Riscritta da Python (FastAPI) a Node.js** (2026-10-14), con lo stesso contratto HTTP: rotte,
  porta 8000, forma degli errori e codici di stato sono quelli di prima, quindi UI e manifest
  k8s non sono cambiati. Differenza visibile: i timestamp hanno i millisecondi invece dei
  microsecondi.
- **Estrazione equa, casuale pesata** (`src/dbmodels/picks.js`). Fra gli utenti che hanno almeno
  un candidato (col filtro di genere), ognuno pesa `1 / (1 + suoi film già visti)`; si estrae
  l'utente secondo il peso, poi un suo film a caso. Quanti film uno propone non conta. I film
  senza utente (nati prima degli utenti) fanno un gruppo a sé. `/api/draw/odds` usa la stessa
  CTE, quindi le probabilità mostrate sono quelle vere; un test fa 300 estrazioni e controlla
  che la frequenza segua il peso.
- **IMDb via l'API GraphQL del sito** (`src/imdb.js`), non un'API pubblica: niente chiave, ma
  è consentita solo per uso limitato e non commerciale, e può cambiare senza preavviso. Senza gli
  header `Origin` e `x-imdb-client-name` risponde 403. Una chiamata dà titolo in italiano, anno,
  locandina (ridimensionata a 300 px dal CDN), regista e generi, solo film. Se IMDb non risponde
  la ricerca dà 502; la lista no, perché i dati del film scelto si salvano nel database.
- **Piattaforme streaming da IMDb**, chieste al momento e mai salvate (cambiano di continuo).
  Si mostrano solo quelle della costante `PLATFORMS` in `src/imdb.js`, e solo in abbonamento
  (Prime Video incluso con Prime è `prime_video.PRIME`; senza suffisso è il noleggio;
  Crunchyroll c'è solo come canale Prime Video, `prime_video.crunchyroll`). Il paese
  IMDb lo prende dall'**IP di chi chiama**, non dalla location della query: i dati sono quelli
  italiani finché l'API gira in Italia.
- **Validazione con gli schemi JSON di Fastify**; gli spazi in testa e in coda si tolgono prima
  (`trimStrings` in `src/utils.js`), e una stringa vuota vale null.
- **pg restituisce bigint e numeric come stringhe**: nella SQL i `count()` hanno `::int` e la
  probabilità `::float8`.
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

Gira come utente `node` (uid 1000) sulla porta 8000.
