from app.db import fetch_all, fetch_one

# Colonne restituite al client, con il nome di chi ha proposto il film.
# Condivise con lo storico estrazioni (picks.py), che fa la stessa join.
MOVIE_COLUMNS = """
    m.movie_id, m.imdb_id, m.title, m."year", m.poster_url, m.director,
    m.genres, m.notes, m.user_id, u."name" AS user_name, m.created, m.watched
"""

MOVIE_JOINS = "LEFT JOIN users u ON u.user_id = m.user_id"

SELECT_MOVIES = f"SELECT {MOVIE_COLUMNS} FROM movies m {MOVIE_JOINS}"


async def list_movies() -> list[dict]:
    return await fetch_all(SELECT_MOVIES + " ORDER BY m.watched NULLS FIRST, lower(m.title)")


async def get_movie(movie_id: int) -> dict | None:
    return await fetch_one(SELECT_MOVIES + " WHERE m.movie_id = %(movie_id)s", {"movie_id": movie_id})


# Il film scelto fra i risultati IMDb, con chi lo propone. Se e' gia' fra i
# da vedere l'indice unico parziale su imdb_id fa saltare l'inserimento: None.
# Se invece e' gia' stato visto entra lo stesso, come riga nuova: la vecchia
# resta nella storia. Un user_id che non esiste solleva ForeignKeyViolation:
# la gestisce il router.
async def add_movie(movie: dict) -> dict | None:
    row = await fetch_one(
        """
        INSERT INTO movies (imdb_id, title, "year", poster_url, director, genres, user_id)
        VALUES (%(imdb_id)s, %(title)s, %(year)s, %(poster_url)s, %(director)s, %(genres)s, %(user_id)s)
        ON CONFLICT (imdb_id) WHERE watched IS NULL DO NOTHING
        RETURNING movie_id
        """,
        movie,
    )
    if not row:
        return None
    return await get_movie(row["movie_id"])


# Solo i campi nostri: quelli presi da IMDb non si modificano.
async def update_movie(movie_id: int, movie: dict) -> dict | None:
    row = await fetch_one(
        """
        UPDATE movies
        SET notes = %(notes)s, user_id = %(user_id)s
        WHERE movie_id = %(movie_id)s
        RETURNING movie_id
        """,
        {**movie, "movie_id": movie_id},
    )
    if not row:
        return None
    return await get_movie(movie_id)


async def set_watched(movie_id: int, watched: bool) -> dict | None:
    row = await fetch_one(
        """
        UPDATE movies
        SET watched = CASE WHEN %(watched)s THEN COALESCE(watched, NOW()) ELSE NULL END
        WHERE movie_id = %(movie_id)s
        RETURNING movie_id
        """,
        {"movie_id": movie_id, "watched": watched},
    )
    if not row:
        return None
    return await get_movie(movie_id)


async def delete_movie(movie_id: int) -> bool:
    row = await fetch_one(
        "DELETE FROM movies WHERE movie_id = %(movie_id)s RETURNING movie_id",
        {"movie_id": movie_id},
    )
    return row is not None
