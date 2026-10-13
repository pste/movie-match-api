from app.db import fetch_all, fetch_one
from app.dbmodels.movies import MOVIE_COLUMNS, MOVIE_JOINS

SELECT_PICKS = f"""
    SELECT p.pick_id, p.picked, {MOVIE_COLUMNS}
    FROM picks p
    JOIN movies m ON m.movie_id = p.movie_id
    {MOVIE_JOINS}
"""

PICK_FIELDS = ("pick_id", "picked")

# Estrazione equa, casuale pesata.
#
# candidates: i film ancora da vedere, con due filtri facoltativi e
#             combinabili: un genere fra i loro (un film ne ha di solito da uno
#             a tre) e l'utente che li ha proposti. Con l'utente scelto resta
#             un gruppo solo, e l'estrazione e' semplicemente a caso fra i
#             suoi film.
# weights:    un gruppo per ogni utente che ha almeno un candidato (i film
#             senza utente, nati prima degli utenti, fanno un gruppo a se').
#             Il peso e' 1 / (1 + film di quell'utente gia' visti): chi ha
#             avuto meno film scelti ha piu' probabilita' di uscire.
#
# Il numero di candidati di un utente non conta: proporre dieci film non
# aumenta le probabilita' di essere scelti.
WEIGHTS_CTE = """
    candidates AS (
        SELECT movie_id, user_id FROM movies
        WHERE watched IS NULL
          AND (%(genre)s::varchar IS NULL
               OR lower(%(genre)s::varchar) IN (SELECT lower(g) FROM unnest(genres) AS g))
          AND (%(user_id)s::integer IS NULL OR user_id = %(user_id)s::integer)
    ),
    weights AS (
        SELECT c.user_id,
               count(*) AS candidates,
               (SELECT count(*) FROM movies w
                WHERE w.watched IS NOT NULL AND w.user_id IS NOT DISTINCT FROM c.user_id) AS watched
        FROM candidates c
        GROUP BY c.user_id
    )
"""


# La riga e' piatta (estrazione + film): la si divide nella forma di PickOut.
def to_pick(row: dict) -> dict:
    pick = {field: row.pop(field) for field in PICK_FIELDS}
    pick["movie"] = row
    return pick


# Le probabilita' attuali di ogni utente: la stessa CTE dell'estrazione, cosi'
# quello che mostra la UI e' esattamente quello che succede.
async def odds(genre: str | None, user_id: int | None) -> list[dict]:
    return await fetch_all(
        f"""
        WITH {WEIGHTS_CTE}
        SELECT w.user_id, u."name" AS user_name, w.candidates, w.watched,
               (1.0 / (1 + w.watched)) / sum(1.0 / (1 + w.watched)) OVER () AS probability
        FROM weights w
        LEFT JOIN users u ON u.user_id = w.user_id
        ORDER BY probability DESC, lower(u."name")
        """,
        {"genre": genre, "user_id": user_id},
    )


# Prima si sceglie l'utente secondo il peso, poi un suo film a caso; il tutto
# in un'istruzione, insieme alla registrazione nello storico.
#
# La scelta pesata usa la chiave -ln(U) / peso, U uniforme in (0, 1]: il
# minimo esce con probabilita' proporzionale al peso (Efraimidis-Spirakis).
# 1 - random() perche' random() puo' valere 0, e ln(0) non esiste.
# MATERIALIZED: chosen_user va calcolata una volta sola.
async def draw(genre: str | None, user_id: int | None) -> dict | None:
    row = await fetch_one(
        f"""
        WITH {WEIGHTS_CTE},
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
        RETURNING pick_id
        """,
        {"genre": genre, "user_id": user_id},
    )
    if not row:
        return None
    pick = await fetch_one(SELECT_PICKS + " WHERE p.pick_id = %(pick_id)s", {"pick_id": row["pick_id"]})
    return to_pick(pick)


async def list_picks(limit: int) -> list[dict]:
    rows = await fetch_all(SELECT_PICKS + " ORDER BY p.picked DESC LIMIT %(limit)s", {"limit": limit})
    return [to_pick(row) for row in rows]
