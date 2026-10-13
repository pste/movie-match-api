from fastapi import APIRouter, HTTPException
from psycopg import errors

from app.dbmodels import movies
from app.schemas import MovieCreate, MovieOut, MovieUpdate, WatchedIn

router = APIRouter(prefix="/api/movies", tags=["film"])


def not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Film non trovato")


def already_in_list() -> HTTPException:
    return HTTPException(status_code=409, detail="Film gia' in lista")


def unknown_user() -> HTTPException:
    return HTTPException(status_code=422, detail="Utente non trovato")


def movie_or_404(movie: dict | None) -> dict:
    if not movie:
        raise not_found()
    return movie


@router.get("", response_model=list[MovieOut])
async def list_movies():
    """Tutti i film: prima quelli da vedere, poi i gia' visti."""
    return await movies.list_movies()


@router.post("", response_model=MovieOut, status_code=201)
async def add_movie(body: MovieCreate):
    """Aggiunge alla lista un film scelto fra i risultati di /api/imdb/search, con chi lo propone.
    Un film gia' visto si puo' riaggiungere: diventa una riga nuova, la vecchia resta nei visti."""
    try:
        movie = await movies.add_movie(body.model_dump())
    except errors.ForeignKeyViolation:
        raise unknown_user()
    if not movie:
        raise already_in_list()
    return movie


@router.put("/{movie_id}", response_model=MovieOut)
async def update_movie(movie_id: int, body: MovieUpdate):
    """Modifica genere, note e utente: gli altri campi vengono da IMDb."""
    try:
        movie = await movies.update_movie(movie_id, body.model_dump())
    except errors.ForeignKeyViolation:
        raise unknown_user()
    return movie_or_404(movie)


@router.put("/{movie_id}/watched", response_model=MovieOut)
async def set_watched(movie_id: int, body: WatchedIn):
    """Segna un film come visto (esce dall'estrazione) o lo rimette fra i da vedere.
    Rimetterlo fra i da vedere fallisce se lo stesso film e' gia' stato riaggiunto."""
    try:
        movie = await movies.set_watched(movie_id, body.watched)
    except errors.UniqueViolation:
        raise already_in_list()
    return movie_or_404(movie)


@router.delete("/{movie_id}")
async def delete_movie(movie_id: int):
    if not await movies.delete_movie(movie_id):
        raise not_found()
    return {"deleted": movie_id}
