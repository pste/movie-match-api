const pg = require('pg');
const logger = require('./logger');

// Le stesse variabili di libpq e del secret k8s movie-match-pgcreds.
const pool = new pg.Pool({
    max: 5,
    idleTimeoutMillis: 20000,
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE || 'moviematch',
    user: process.env.PGUSER || 'moviematch',
    password: process.env.PGPASSWORD || '',
});

// Un client inattivo che perde la connessione -- Postgres riavviato, il pod
// spostato -- emette 'error' sul pool. Senza un ascoltatore Node lo tratta come
// eccezione non gestita e il processo esce. Il client guasto viene gia'
// scartato dal pool: basta registrarlo.
pool.on('error', (err) => {
    logger.warn({ err: err.message }, 'connessione inattiva al database persa');
});

// Codici di errore di Postgres che le rotte traducono in risposte HTTP.
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

// Ogni chiamata e' una transazione: pool.query esegue un'istruzione sola in
// autocommit, e se fallisce non resta niente a meta'.
async function fetchOne(sql, params) {
    const res = await pool.query(sql, params);
    return res.rows[0] || null;
}

async function fetchAll(sql, params) {
    const res = await pool.query(sql, params);
    return res.rows;
}

async function close() {
    await pool.end();
}

module.exports = { fetchOne, fetchAll, close, FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION };
