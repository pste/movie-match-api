const { fetchAll, fetchOne } = require('../db');

// Colonne restituite al client, con il nome di chi ha proposto il film.
// Condivise con lo storico estrazioni (picks.js), che fa la stessa join.
const MOVIE_COLUMNS = `
    m.movie_id, m.imdb_id, m.title, m."year", m.poster_url, m.director,
    m.genres, m.notes, m.user_id, u."name" AS user_name, m.created, m.watched
`;

const MOVIE_JOINS = 'LEFT JOIN users u ON u.user_id = m.user_id';

const SELECT_MOVIES = `SELECT ${MOVIE_COLUMNS} FROM movies m ${MOVIE_JOINS}`;

async function listMovies() {
    return await fetchAll(SELECT_MOVIES + ' ORDER BY m.watched NULLS FIRST, lower(m.title)');
}

async function getMovie(movieId) {
    return await fetchOne(SELECT_MOVIES + ' WHERE m.movie_id = $1', [movieId]);
}

// Le scritture restituiscono solo l'id: il film completo, col nome
// dell'utente, lo rilegge getMovie. null se la riga non c'e'.
async function reloaded(row) {
    if (!row) {
        return null;
    }
    return await getMovie(row.movie_id);
}

// Il film scelto fra i risultati IMDb, con chi lo propone. Se e' gia' fra i
// da vedere l'indice unico parziale su imdb_id fa saltare l'inserimento: null.
// Se invece e' gia' stato visto entra lo stesso, come riga nuova: la vecchia
// resta nella storia. Un user_id che non esiste solleva FOREIGN_KEY_VIOLATION:
// la gestisce la rotta.
async function addMovie(movie) {
    const row = await fetchOne(`
        INSERT INTO movies (imdb_id, title, "year", poster_url, director, genres, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (imdb_id) WHERE watched IS NULL DO NOTHING
        RETURNING movie_id`,
        [movie.imdb_id, movie.title, movie.year, movie.poster_url, movie.director, movie.genres, movie.user_id]);
    return await reloaded(row);
}

// Solo i campi nostri: quelli presi da IMDb non si modificano.
async function updateMovie(movieId, movie) {
    const row = await fetchOne(`
        UPDATE movies
        SET notes = $2, user_id = $3
        WHERE movie_id = $1
        RETURNING movie_id`,
        [movieId, movie.notes, movie.user_id]);
    return await reloaded(row);
}

async function setWatched(movieId, watched) {
    const row = await fetchOne(`
        UPDATE movies
        SET watched = CASE WHEN $2 THEN COALESCE(watched, NOW()) ELSE NULL END
        WHERE movie_id = $1
        RETURNING movie_id`,
        [movieId, watched]);
    return await reloaded(row);
}

async function deleteMovie(movieId) {
    const row = await fetchOne('DELETE FROM movies WHERE movie_id = $1 RETURNING movie_id', [movieId]);
    return row !== null;
}

// Per backfillGenres.js: i film senza generi, e l'aggiornamento dei generi.
async function listMoviesWithoutGenres() {
    return await fetchAll("SELECT movie_id, imdb_id, title FROM movies WHERE genres = '{}' ORDER BY movie_id");
}

async function setGenres(movieId, genres) {
    await fetchOne('UPDATE movies SET genres = $2 WHERE movie_id = $1 RETURNING movie_id', [movieId, genres]);
}

module.exports = {
    MOVIE_COLUMNS, MOVIE_JOINS,
    listMovies, getMovie, addMovie, updateMovie, setWatched, deleteMovie,
    listMoviesWithoutGenres, setGenres,
};
