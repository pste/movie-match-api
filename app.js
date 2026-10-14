// "node app.js" avvia il server; "node app.js backfill-genres" completa i
// generi IMDb dei film che non ne hanno (vedi src/backfillGenres.js) senza
// avviare niente.
async function start() {
    if (process.argv[2] === 'backfill-genres') {
        await require('./src/backfillGenres').run();
        return;
    }
    await require('./src/server').run();
}

start();
