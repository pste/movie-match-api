const picks = require('../dbmodels/picks');
const schemas = require('../schemas');
const { httpError } = require('../utils');

async function routes(fastify) {

    // Estrazione equa: sceglie un utente pesato su quanti suoi film sono gia'
    // stati visti, poi un suo film a caso fra quelli da vedere. La registra
    // nello storico. Filtri facoltativi: genere e utente (con l'utente e' a
    // caso fra i suoi film).
    fastify.post('/draw', { schema: { body: schemas.drawFilters } }, async (req, reply) => {
        const body = req.body || {};
        const pick = await picks.draw(body.genre ?? null, body.user_id ?? null);
        if (!pick) {
            return httpError(reply, 409, 'Nessun film da estrarre');
        }
        return reply.status(201).send(pick);
    });

    // Probabilita' attuale di ogni utente all'estrazione, con gli stessi filtri.
    fastify.get('/draw/odds', { schema: { querystring: schemas.drawFilters } }, async (req) => {
        return await picks.odds(req.query.genre, req.query.user_id);
    });

    // Le ultime estrazioni, dalla piu' recente.
    fastify.get('/picks', { schema: { querystring: schemas.picksQuery } }, async (req) => {
        return await picks.listPicks(req.query.limit);
    });
}

module.exports = routes;
