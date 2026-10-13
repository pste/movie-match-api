import random
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

# I test girano contro il Postgres di sviluppo (quello di .env), con lo schema
# gia' applicato dalle migrations di movie-match-db: niente mock del database,
# perche' quasi tutta la logica sta nella SQL.
#
# La lista e' una sola e puo' contenere gia' dei film: ogni test usa un genere
# e degli utenti tutti suoi, cosi' estrazione e probabilita' filtrate per
# genere vedono solo i dati del test.


@pytest.fixture(scope="session")
def client():
    # Il context manager esegue il lifespan, cioe' apre il pool.
    with TestClient(app) as test_client:
        yield test_client


def unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def fake_imdb_id() -> str:
    # tt + 10 cifre: lungo quanto un id vero ma fuori dai numeri gia' usati.
    return f"tt9{random.randrange(10**9):09d}"


@pytest.fixture
def genre():
    return unique("test")


@pytest.fixture
def created():
    """Raccoglie gli id creati dal test e li cancella alla fine: prima i film
    (la cascade porta via le estrazioni), poi gli utenti, che coi film non si
    potrebbero cancellare."""
    ids = {"movies": [], "users": []}
    yield ids
    with psycopg.connect(
        host=settings.pghost,
        port=settings.pgport,
        dbname=settings.pgdatabase,
        user=settings.pguser,
        password=settings.pgpassword,
    ) as conn:
        conn.execute("DELETE FROM movies WHERE movie_id = ANY(%s)", (ids["movies"],))
        conn.execute("DELETE FROM users WHERE user_id = ANY(%s)", (ids["users"],))


@pytest.fixture
def add_user(client, created):
    def factory(prefix: str = "utente") -> dict:
        res = client.post("/api/users", json={"name": unique(prefix)})
        assert res.status_code == 201
        user = res.json()
        created["users"].append(user["user_id"])
        return user

    return factory


@pytest.fixture
def user(add_user):
    return add_user()


@pytest.fixture
def add_movie(client, created, user):
    """Aggiunge film come se fossero scelti dalla ricerca IMDb, proposti da
    owner (di default l'utente del test). genre, se passato, finisce fra i
    generi del film, come arriverebbe da IMDb."""
    def factory(title: str, genre: str | None = None, owner: dict | None = None, **extra) -> dict:
        owner = owner or user
        body = {"imdb_id": fake_imdb_id(), "title": title, "user_id": owner["user_id"], **extra}
        if genre:
            body["genres"] = ["Commedia", genre]
        res = client.post("/api/movies", json=body)
        assert res.status_code == 201
        movie = res.json()
        created["movies"].append(movie["movie_id"])
        return movie

    return factory
