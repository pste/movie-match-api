const fastifyApp = require('fastify');

const logger = require('./logger');
const db = require('./db');
const { httpError, trimStrings } = require('./utils');

const PORT = parseInt(process.env.PORT, 10) || 8000;

// Tutte le rotte stanno sotto /api: in produzione l'ingress manda /api qui e il
// resto alla UI, sullo stesso host; in sviluppo fa lo stesso il proxy di Vite.
// Per questo non serve CORS.
function buildServer() {
    const fastify = fastifyApp({
        loggerInstance: logger,
        requestTimeout: 30 * 1000,
        // Dietro Traefik l'IP del client arriva da X-Forwarded-For.
        trustProxy: true,
        // Gli schemi usano tipi come ['string', 'null'] per i campi facoltativi.
        ajv: { customOptions: { allowUnionTypes: true } },
    });

    // Prima della validazione: gli schemi vedono i valori gia' senza spazi.
    fastify.addHook('preValidation', async (req) => {
        trimStrings(req.body);
        trimStrings(req.query);
    });

    // Dati non validi: 422 con l'elenco degli errori, come faceva FastAPI. La
    // UI ci mostra "Dati non validi".
    fastify.setErrorHandler((err, req, reply) => {
        if (err.validation) {
            return httpError(reply, 422, err.validation);
        }
        // Gli altri errori del client: JSON malformato, body troppo grande...
        if (err.statusCode && err.statusCode < 500) {
            return httpError(reply, err.statusCode, err.message);
        }
        req.log.error({ err }, 'errore non gestito');
        return httpError(reply, 500, 'Errore interno');
    });

    fastify.setNotFoundHandler((req, reply) => {
        return httpError(reply, 404, 'Not Found');
    });

    fastify.register(async (api) => {
        // Non tocca il database: e' la probe di k8s, e un Postgres lento non e'
        // un motivo per riavviare l'API.
        api.get('/health', async () => {
            return { status: 'ok' };
        });

        api.register(require('./routes/imdb'));
        api.register(require('./routes/users'));
        api.register(require('./routes/movies'));
        api.register(require('./routes/picks'));
    }, { prefix: '/api' });

    // Chiudendo il server si chiude anche il pool del database.
    fastify.addHook('onClose', async () => {
        await db.close();
    });

    return fastify;
}

async function run() {
    const fastify = buildServer();

    // k8s ferma il pod con SIGTERM: si finiscono le richieste in corso.
    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.on(signal, async () => {
            await fastify.close();
            process.exit(0);
        });
    }

    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
    }
    catch(err) {
        logger.error(err, 'avvio fallito');
        process.exit(1);
    }
}

module.exports = { buildServer, run };
