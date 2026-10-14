const users = require('../dbmodels/users');
const schemas = require('../schemas');
const { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } = require('../db');
const { httpError } = require('../utils');

function notFound(reply) {
    return httpError(reply, 404, 'Utente non trovato');
}

function duplicate(reply, name) {
    return httpError(reply, 409, `Esiste gia' un utente ${name}`);
}

async function routes(fastify) {

    // Gli utenti, con quanti film hanno in gara e quanti gia' visti.
    fastify.get('/users', async () => {
        return await users.listUsers();
    });

    fastify.post('/users', { schema: { body: schemas.userBody } }, async (req, reply) => {
        try {
            const user = await users.addUser(req.body.name);
            return reply.status(201).send(user);
        }
        catch(err) {
            if (err.code === UNIQUE_VIOLATION) {
                return duplicate(reply, req.body.name);
            }
            throw err;
        }
    });

    const renameSchema = { params: schemas.idParams, body: schemas.userBody };
    fastify.put('/users/:id', { schema: renameSchema }, async (req, reply) => {
        let user = null;
        try {
            user = await users.renameUser(req.params.id, req.body.name);
        }
        catch(err) {
            if (err.code === UNIQUE_VIOLATION) {
                return duplicate(reply, req.body.name);
            }
            throw err;
        }
        if (!user) {
            return notFound(reply);
        }
        return user;
    });

    fastify.delete('/users/:id', { schema: { params: schemas.idParams } }, async (req, reply) => {
        let deleted = false;
        try {
            deleted = await users.deleteUser(req.params.id);
        }
        catch(err) {
            if (err.code === FOREIGN_KEY_VIOLATION) {
                return httpError(reply, 409, "L'utente ha dei film: assegnali a qualcun altro o eliminali prima");
            }
            throw err;
        }
        if (!deleted) {
            return notFound(reply);
        }
        return { deleted: req.params.id };
    });
}

module.exports = routes;
