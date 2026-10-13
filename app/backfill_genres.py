import asyncio

from app import db, imdb
from app.db import fetch_all, fetch_one

# Completa i generi IMDb dei film che non ne hanno: quelli aggiunti prima che
# la ricerca li salvasse. Da lanciare a mano, una volta, dopo la migration
# imdbGenres:
#
#   .venv/bin/python -m app.backfill_genres
#
# E' idempotente: tocca solo i film con l'array vuoto, quindi rilanciarlo non
# fa danni.


async def main() -> None:
    await db.open_pool()
    try:
        movies = await fetch_all("SELECT movie_id, imdb_id, title FROM movies WHERE genres = '{}' ORDER BY movie_id")
        for movie in movies:
            found = await imdb.get_title(movie["imdb_id"])
            genres = found["genres"] if found else []
            await fetch_one(
                "UPDATE movies SET genres = %(genres)s WHERE movie_id = %(movie_id)s RETURNING movie_id",
                {"genres": genres, "movie_id": movie["movie_id"]},
            )
            print(f"{movie['title']}: {', '.join(genres) or 'nessun genere su IMDb'}")
        print(f"{len(movies)} film aggiornati")
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
