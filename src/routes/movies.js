const movies = require('../dbmodels/movies');
const schemas = require('../schemas');
const { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } = require('../db');
const { httpError } = require('../utils');

function notFound(reply) {
    return httpError(reply, 404, 'Film non trovato');
}

function alreadyInList(reply) {
    return httpError(reply, 409, "Film gia' in lista");
}

function unknownUser(reply) {
    return httpError(reply, 422, 'Utente non trovato');
}

async function routes(fastify) {

    // Tutti i film: prima quelli da vedere, poi i gia' visti.
    fastify.get('/movies', async () => {
        return await movies.listMovies();
    });

    // Aggiunge alla lista un film scelto fra i risultati di /api/imdb/search,
    // con chi lo propone. Un film gia' visto si puo' riaggiungere: diventa una
    // riga nuova, la vecchia resta nei visti.
    fastify.post('/movies', { schema: { body: schemas.movieCreate } }, async (req, reply) => {
        let movie = null;
        try {
            movie = await movies.addMovie(req.body);
        }
        catch(err) {
            if (err.code === FOREIGN_KEY_VIOLATION) {
                return unknownUser(reply);
            }
            throw err;
        }
        if (!movie) {
            return alreadyInList(reply);
        }
        return reply.status(201).send(movie);
    });

    // Modifica note e utente: gli altri campi vengono da IMDb.
    const updateSchema = { params: schemas.idParams, body: schemas.movieUpdate };
    fastify.put('/movies/:id', { schema: updateSchema }, async (req, reply) => {
        let movie = null;
        try {
            movie = await movies.updateMovie(req.params.id, req.body);
        }
        catch(err) {
            if (err.code === FOREIGN_KEY_VIOLATION) {
                return unknownUser(reply);
            }
            throw err;
        }
        if (!movie) {
            return notFound(reply);
        }
        return movie;
    });

    // Segna un film come visto (esce dall'estrazione) o lo rimette fra i da
    // vedere. Rimetterlo fra i da vedere fallisce se lo stesso film e' gia'
    // stato riaggiunto.
    const watchedSchema = { params: schemas.idParams, body: schemas.watchedBody };
    fastify.put('/movies/:id/watched', { schema: watchedSchema }, async (req, reply) => {
        let movie = null;
        try {
            movie = await movies.setWatched(req.params.id, req.body.watched);
        }
        catch(err) {
            if (err.code === UNIQUE_VIOLATION) {
                return alreadyInList(reply);
            }
            throw err;
        }
        if (!movie) {
            return notFound(reply);
        }
        return movie;
    });

    fastify.delete('/movies/:id', { schema: { params: schemas.idParams } }, async (req, reply) => {
        if (!await movies.deleteMovie(req.params.id)) {
            return notFound(reply);
        }
        return { deleted: req.params.id };
    });
}

module.exports = routes;
