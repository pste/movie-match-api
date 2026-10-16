const imdb = require('../imdb');
const schemas = require('../schemas');
const { httpError } = require('../utils');

// Una chiamata a IMDb: se non risponde e' 502, con il motivo nel log.
async function callImdb(req, reply, what, call) {
    try {
        return await call();
    }
    catch(err) {
        if (!(err instanceof imdb.ImdbError)) {
            throw err;
        }
        req.log.warn({ err: err.message }, `${what} IMDb fallita`);
        return httpError(reply, 502, 'IMDb non risponde, riprova fra poco');
    }
}

async function routes(fastify) {

    // Cerca film su IMDb per titolo: titolo, anno, locandina, regista e generi.
    fastify.get('/imdb/search', { schema: { querystring: schemas.imdbSearchQuery } }, async (req, reply) => {
        return await callImdb(req, reply, 'ricerca', () => imdb.search(req.query.q));
    });

    // Su quali piattaforme (fra quelle di PLATFORMS in imdb.js) il film e' in
    // abbonamento adesso, in Italia: [{name, logo_url, link}].
    fastify.get('/imdb/:imdb_id/platforms', { schema: { params: schemas.imdbIdParams } }, async (req, reply) => {
        return await callImdb(req, reply, 'lettura piattaforme', () => imdb.getWatchOptions(req.params.imdb_id));
    });
}

module.exports = routes;
