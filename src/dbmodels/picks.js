const { fetchAll, fetchOne } = require('../db');
const { MOVIE_COLUMNS, MOVIE_JOINS } = require('./movies');

const SELECT_PICKS = `
    SELECT p.pick_id, p.picked, ${MOVIE_COLUMNS}
    FROM picks p
    JOIN movies m ON m.movie_id = p.movie_id
    ${MOVIE_JOINS}
`;

// Estrazione equa, casuale pesata. Parametri: $1 genere, $2 utente.
//
// candidates: i film ancora da vedere, con due filtri facoltativi e
//             combinabili: un genere fra i loro (un film ne ha di solito da uno
//             a tre) e l'utente che li ha proposti. Con l'utente scelto resta
//             un gruppo solo, e l'estrazione e' semplicemente a caso fra i
//             suoi film.
// weights:    un gruppo per ogni utente che ha almeno un candidato (i film
//             senza utente, nati prima degli utenti, fanno un gruppo a se').
//             Il peso e' 1 / (1 + film di quell'utente gia' visti): chi ha
//             avuto meno film scelti ha piu' probabilita' di uscire.
//
// Il numero di candidati di un utente non conta: proporre dieci film non
// aumenta le probabilita' di essere scelti.
const WEIGHTS_CTE = `
    candidates AS (
        SELECT movie_id, user_id FROM movies
        WHERE watched IS NULL
          AND ($1::varchar IS NULL
               OR lower($1::varchar) IN (SELECT lower(g) FROM unnest(genres) AS g))
          AND ($2::integer IS NULL OR user_id = $2::integer)
    ),
    weights AS (
        SELECT c.user_id,
               count(*)::int AS candidates,
               (SELECT count(*) FROM movies w
                WHERE w.watched IS NOT NULL AND w.user_id IS NOT DISTINCT FROM c.user_id)::int AS watched
        FROM candidates c
        GROUP BY c.user_id
    )
`;

// La riga e' piatta (estrazione + film): la si divide nella forma
// { pick_id, picked, movie }.
function toPick(row) {
    const { pick_id, picked, ...movie } = row;
    return { pick_id, picked, movie };
}

// Le probabilita' attuali di ogni utente: la stessa CTE dell'estrazione, cosi'
// quello che mostra la UI e' esattamente quello che succede.
// ::float8 perche' pg restituirebbe il numeric come stringa.
async function odds(genre, userId) {
    return await fetchAll(`
        WITH ${WEIGHTS_CTE}
        SELECT w.user_id, u."name" AS user_name, w.candidates, w.watched,
               ((1.0 / (1 + w.watched)) / sum(1.0 / (1 + w.watched)) OVER ())::float8 AS probability
        FROM weights w
        LEFT JOIN users u ON u.user_id = w.user_id
        ORDER BY probability DESC, lower(u."name")`,
        [genre, userId]);
}

// Prima si sceglie l'utente secondo il peso, poi un suo film a caso; il tutto
// in un'istruzione, insieme alla registrazione nello storico.
//
// La scelta pesata usa la chiave -ln(U) / peso, U uniforme in (0, 1]: il
// minimo esce con probabilita' proporzionale al peso (Efraimidis-Spirakis).
// 1 - random() perche' random() puo' valere 0, e ln(0) non esiste.
// MATERIALIZED: chosen_user va calcolata una volta sola.
async function draw(genre, userId) {
    const row = await fetchOne(`
        WITH ${WEIGHTS_CTE},
        chosen_user AS MATERIALIZED (
            SELECT user_id FROM weights
            ORDER BY -ln(1 - random()) * (1 + watched)
            LIMIT 1
        ),
        chosen AS (
            SELECT c.movie_id FROM candidates c
            JOIN chosen_user cu ON c.user_id IS NOT DISTINCT FROM cu.user_id
            ORDER BY random()
            LIMIT 1
        )
        INSERT INTO picks (movie_id)
        SELECT movie_id FROM chosen
        RETURNING pick_id`,
        [genre, userId]);
    if (!row) {
        return null;
    }
    const pick = await fetchOne(SELECT_PICKS + ' WHERE p.pick_id = $1', [row.pick_id]);
    return toPick(pick);
}

async function listPicks(limit) {
    const rows = await fetchAll(SELECT_PICKS + ' ORDER BY p.picked DESC LIMIT $1', [limit]);
    return rows.map(toPick);
}

module.exports = { odds, draw, listPicks };
