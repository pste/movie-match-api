const imdb = require('../imdb');
const schemas = require('../schemas');
const { httpError } = require('../utils');

async function routes(fastify) {

    // Cerca film su IMDb per titolo: titolo, anno, locandina, regista e generi.
    fastify.get('/imdb/search', { schema: { querystring: schemas.imdbSearchQuery } }, async (req, reply) => {
        try {
            return await imdb.search(req.query.q);
        }
        catch(err) {
            if (!(err instanceof imdb.ImdbError)) {
                throw err;
            }
            req.log.warn({ err: err.message }, 'ricerca IMDb fallita');
            return httpError(reply, 502, 'IMDb non risponde, riprova fra poco');
        }
    });
}

module.exports = routes;
