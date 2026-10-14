const crypto = require('node:crypto');

const db = require('../src/db');
const { buildServer } = require('../src/server');

// I test girano contro il Postgres di sviluppo (quello di .env), con lo schema
// gia' applicato dalle migrations di movie-match-db: niente mock del database,
// perche' quasi tutta la logica sta nella SQL.
//
// La lista e' una sola e puo' contenere gia' dei film: ogni test usa un genere
// e degli utenti tutti suoi, cosi' estrazione e probabilita' filtrate per
// genere vedono solo i dati del test.

function unique(prefix) {
    return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

// tt + 10 cifre: lungo quanto un id vero ma fuori dai numeri gia' usati.
function fakeImdbId() {
    return `tt9${crypto.randomInt(10 ** 9).toString().padStart(9, '0')}`;
}

// Una richiesta al server senza aprire porte. Restituisce status e body JSON.
async function call(server, method, url, payload) {
    const res = await server.inject({ method, url, payload });
    return { status: res.statusCode, body: res.json() };
}

// I dati di un test: crea utenti e film e li cancella alla fine, prima i film
// (la cascade porta via le estrazioni), poi gli utenti, che coi film non si
// potrebbero cancellare.
function fixtures(t, server) {
    const created = { movies: [], users: [] };

    t.after(async () => {
        await db.fetchAll('DELETE FROM movies WHERE movie_id = ANY($1)', [created.movies]);
        await db.fetchAll('DELETE FROM users WHERE user_id = ANY($1)', [created.users]);
    });

    async function addUser(prefix = 'utente') {
        const res = await call(server, 'POST', '/api/users', { name: unique(prefix) });
        if (res.status !== 201) {
            throw new Error(`addUser: ${res.status}`);
        }
        created.users.push(res.body.user_id);
        return res.body;
    }

    // Aggiunge film come se fossero scelti dalla ricerca IMDb, proposti da
    // owner. genre, se passato, finisce fra i generi del film, come
    // arriverebbe da IMDb.
    async function addMovie(title, { genre = null, owner, ...extra }) {
        const payload = { imdb_id: fakeImdbId(), title, user_id: owner.user_id, ...extra };
        if (genre) {
            payload.genres = ['Commedia', genre];
        }
        const res = await call(server, 'POST', '/api/movies', payload);
        if (res.status !== 201) {
            throw new Error(`addMovie: ${res.status} ${JSON.stringify(res.body)}`);
        }
        created.movies.push(res.body.movie_id);
        return res.body;
    }

    async function watch(movie) {
        return await call(server, 'PUT', `/api/movies/${movie.movie_id}/watched`, { watched: true });
    }

    return { created, addUser, addMovie, watch, genre: unique('test') };
}

module.exports = { buildServer, call, fixtures, fakeImdbId };
