// Gli schemi JSON con cui Fastify valida body, querystring e parametri.
// Un dato non valido riceve 422 (vedi l'error handler in server.js).
//
// Fastify configura Ajv con useDefaults e coerceTypes: i campi facoltativi
// assenti prendono il default (null), e "12" in querystring diventa 12.
// Le stringhe arrivano gia' ripulite dagli spazi da trimStrings (server.js),
// quindi un titolo di soli spazi e' null e non passa.

// Gli id sono integer di Postgres: oltre questo valore la query fallirebbe.
const id = { type: 'integer', minimum: 1, maximum: 2147483647 };
const nullableId = { type: ['integer', 'null'], minimum: 1, maximum: 2147483647, default: null };

function nullableString(maxLength) {
    return { type: ['string', 'null'], maxLength, default: null };
}

const idParams = {
    type: 'object',
    required: ['id'],
    properties: { id },
};

// ---------- IMDb ----------

const imdbSearchQuery = {
    type: 'object',
    required: ['q'],
    properties: {
        q: { type: 'string', minLength: 2, maxLength: 100 },
    },
};

// Un risultato della ricerca IMDb, ed e' anche quello che la UI rimanda per
// aggiungere il film scelto alla lista: piu' chi lo propone, obbligatorio.
const movieCreate = {
    type: 'object',
    required: ['imdb_id', 'title', 'user_id'],
    properties: {
        imdb_id: { type: 'string', pattern: '^tt\\d{5,10}$' },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        year: { type: ['integer', 'null'], minimum: 1880, maximum: 2100, default: null },
        poster_url: { type: ['string', 'null'], maxLength: 500, pattern: '^https://', default: null },
        director: nullableString(200),
        // Di solito da uno a tre ("Horror", "Fantascienza").
        genres: {
            type: 'array',
            maxItems: 10,
            items: { type: 'string', minLength: 1, maxLength: 40 },
            default: [],
        },
        user_id: id,
    },
};

// ---------- film ----------

// Titolo, anno, locandina, regista e generi vengono da IMDb e non si
// modificano: note e utente sono i campi nostri. user_id resta facoltativo per
// i film nati prima degli utenti.
const movieUpdate = {
    type: 'object',
    properties: {
        notes: nullableString(500),
        user_id: nullableId,
    },
};

const watchedBody = {
    type: 'object',
    required: ['watched'],
    properties: {
        watched: { type: 'boolean' },
    },
};

// ---------- utenti ----------

const userBody = {
    type: 'object',
    required: ['name'],
    properties: {
        name: { type: 'string', minLength: 1, maxLength: 40 },
    },
};

// ---------- estrazioni ----------

// Filtri facoltativi: solo i film di questo genere, solo quelli proposti da
// questo utente. Uguali per l'estrazione e per le probabilita'.
const drawFilters = {
    type: 'object',
    properties: {
        genre: nullableString(40),
        user_id: nullableId,
    },
};

const picksQuery = {
    type: 'object',
    properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
};

module.exports = {
    idParams, imdbSearchQuery, movieCreate, movieUpdate, watchedBody, userBody, drawFilters, picksQuery,
};
