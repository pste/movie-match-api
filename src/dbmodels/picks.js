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
// I candidati con il loro peso vengono dalla view draw_candidates (vedi la
// migration drawCandidates in movie-match-db): film ancora da vedere, weight =
// 1 / (1 + film gia' visti del suo utente). Qui si aggiungono i due filtri
// facoltativi e combinabili, che una view non puo' ricevere: un genere fra
// quelli del film (di solito da uno a tre) e l'utente che l'ha proposto. Con
// l'utente scelto resta un gruppo solo, e l'estrazione e' semplicemente a caso
// fra i suoi film.
const CANDIDATES_CTE = `
    candidates AS (
        SELECT movie_id, user_id, user_watched, weight FROM draw_candidates
        WHERE ($1::varchar IS NULL
               OR lower($1::varchar) IN (SELECT lower(g) FROM unnest(genres) AS g))
          AND ($2::integer IS NULL OR user_id = $2::integer)
    )
`;

// La riga e' piatta (estrazione + film): la si divide nella forma
// { pick_id, picked, movie }.
function toPick(row) {
    const { pick_id, picked, ...movie } = row;
    return { pick_id, picked, movie };
}

// Le probabilita' attuali di ogni utente: stessi candidati e stesso peso
// dell'estrazione, cosi' quello che mostra la UI e' esattamente quello che
// succede. Un gruppo per ogni utente che ha almeno un candidato (i film senza
// utente fanno un gruppo a se'); il numero di candidati non conta nel peso.
async function odds(genre, userId) {
    return await fetchAll(`
        WITH ${CANDIDATES_CTE}
        SELECT c.user_id, u."name" AS user_name,
               count(*)::int AS candidates,
               c.user_watched AS watched,
               c.weight / sum(c.weight) OVER () AS probability
        FROM candidates c
        LEFT JOIN users u ON u.user_id = c.user_id
        GROUP BY c.user_id, u."name", c.user_watched, c.weight
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
        WITH ${CANDIDATES_CTE},
        chosen_user AS MATERIALIZED (
            SELECT user_id FROM candidates
            GROUP BY user_id, weight
            ORDER BY -ln(1 - random()) / weight
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
