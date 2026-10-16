// Ricerca film su IMDb, tramite l'API GraphQL che usa il sito stesso.
//
// Non e' un'API pubblica documentata: IMDb ne consente un uso limitato, non
// commerciale (lo dice il campo "disclaimer" di ogni risposta), che e' il caso
// di un'app di casa. Senza Origin e x-imdb-client-name risponde 403.
// Una sola chiamata da' titolo e generi (in italiano, con x-imdb-user-language),
// anno, locandina e regista di ogni risultato, solo film (niente serie).
//
// Da' anche dove si puo' vedere un film in streaming. Il paese lo decide IMDb
// dall'IP di chi chiama, non dalla location della query (provato: con le
// coordinate di New York risponde comunque con NOW Italia): funziona finche'
// l'API gira in Italia.
const GRAPHQL_URL = 'https://api.graphql.imdb.com/';

const HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://www.imdb.com',
    'x-imdb-client-name': 'imdb-web-next-localized',
    'x-imdb-user-language': 'it-IT',
    'x-imdb-user-country': 'IT',
};

// I campi di un film: gli stessi per la ricerca e per la lettura di un id.
const TITLE_FIELDS = `
    id
    titleText { text }
    releaseYear { year }
    primaryImage { url }
    titleGenres { genres { genre { text } } }
    directors: credits(first: 3, filter: {categories: ["director"]}) {
      edges { node { name { nameText { text } } } }
    }
`;

const SEARCH_QUERY = `
query ($q: String!, $first: Int!) {
  mainSearch(first: $first, options: {searchTerm: $q, type: TITLE, includeAdult: false,
                                      titleSearchOptions: {type: [MOVIE]}}) {
    edges { node { entity { ... on Title { ${TITLE_FIELDS} } } } }
  }
}
`;

const TITLE_QUERY = `
query ($id: ID!) {
  title(id: $id) { ${TITLE_FIELDS} }
}
`;

// Le piattaforme da mostrare sul film estratto, per id del provider IMDb: per
// aggiungerne una basta il suo id (es. amzn1.imdb.w2w.provider.now_tv).
// Prime Video "incluso con Prime" ha il suffisso .PRIME: senza e' il noleggio.
// Crunchyroll IMDb lo conosce solo come canale di Prime Video: il link porta
// alla pagina Prime Video del film.
const PLATFORMS = {
    'amzn1.imdb.w2w.provider.netflix': 'Netflix',
    'amzn1.imdb.w2w.provider.disneyplus': 'Disney+',
    'amzn1.imdb.w2w.provider.prime_video.PRIME': 'Prime Video',
    'amzn1.imdb.w2w.provider.prime_video.crunchyroll': 'Crunchyroll',
};

// STREAMING e' la categoria "in abbonamento"; l'altra e' RENT/BUY, a pagamento.
// La location e' Milano, anche se IMDb usa l'IP (vedi sopra).
const WATCH_QUERY = `
query ($id: ID!) {
  title(id: $id) {
    watchOptionsByCategory(location: {latLong: {lat: "45.46", long: "9.19"}}) {
      categorizedWatchOptionsList {
        categoryName { value }
        watchOptions {
          provider { id logos { icon { url } } }
          link(platform: WEB)
        }
      }
    }
  }
}
`;

const RESULTS = 10;
const POSTER_WIDTH = 300;
const LOGO_WIDTH = 64;
const TIMEOUT_MS = 8000;

class ImdbError extends Error {}

// Le locandine IMDb sono su m.media-amazon.com, in originale anche da 2000 px.
// Il suffisso "._V1_<opzioni>.jpg" chiede al CDN una versione ridimensionata:
// a 300 px sono ~15 KB invece di ~1 MB. Vale anche per i loghi delle
// piattaforme, che sono png da 500 px: a 64 px meno di 1 KB.
function resizePoster(url, width = POSTER_WIDTH) {
    if (!url) {
        return null;
    }
    return url.replace(/\._V1_.*\.(jpg|png)$/, `._V1_QL75_UX${width}_.jpg`);
}

function parseTitle(title) {
    const directors = title.directors.edges.map((item) => item.node.name.nameText.text);
    const genres = (title.titleGenres?.genres || []).map((item) => item.genre.text);
    return {
        imdb_id: title.id,
        title: title.titleText.text,
        year: title.releaseYear?.year ?? null,
        poster_url: resizePoster(title.primaryImage?.url),
        director: directors.join(', ') || null,
        genres,
    };
}

function parseSearch(payload) {
    const edges = payload.data?.mainSearch?.edges || [];
    // Il frammento "... on Title" lascia vuoti i risultati di altro tipo.
    return edges
        .filter((edge) => edge.node.entity.id)
        .map((edge) => parseTitle(edge.node.entity));
}

// Le piattaforme in abbonamento fra quelle di PLATFORMS, una volta sola
// ciascuna, nell'ordine dato da IMDb.
function parseWatchOptions(payload) {
    const categories = payload.data?.title?.watchOptionsByCategory?.categorizedWatchOptionsList || [];
    const streaming = categories.find((category) => category.categoryName?.value === 'STREAMING');
    const platforms = [];
    for (const option of streaming?.watchOptions || []) {
        const name = PLATFORMS[option.provider?.id];
        if (!name || platforms.some((platform) => platform.name === name)) {
            continue;
        }
        const logoUrl = resizePoster(option.provider.logos?.icon?.url, LOGO_WIDTH);
        platforms.push({ name, logo_url: logoUrl, link: option.link ?? null });
    }
    return platforms;
}

async function queryImdb(query, variables) {
    let payload = null;
    try {
        const res = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ query, variables }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        payload = await res.json();
    }
    catch(err) {
        throw new ImdbError(err.message);
    }
    if (payload.errors?.length) {
        throw new ImdbError(payload.errors[0].message || 'errore GraphQL');
    }
    return payload;
}

async function search(query) {
    return parseSearch(await queryImdb(SEARCH_QUERY, { q: query, first: RESULTS }));
}

// Un film per id: serve a ricompletare i film gia' in lista (backfillGenres.js).
async function getTitle(imdbId) {
    const payload = await queryImdb(TITLE_QUERY, { id: imdbId });
    const title = payload.data?.title;
    return title ? parseTitle(title) : null;
}

// Dove si puo' vedere un film adesso: non si salva, cambia di continuo.
async function getWatchOptions(imdbId) {
    return parseWatchOptions(await queryImdb(WATCH_QUERY, { id: imdbId }));
}

module.exports = { ImdbError, resizePoster, parseSearch, parseWatchOptions, search, getTitle, getWatchOptions };
