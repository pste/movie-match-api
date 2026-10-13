from app import imdb
from tests.conftest import fake_imdb_id


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


# ---------- film ----------

def test_movie_crud(client, add_movie, user, add_user):
    movie = add_movie("  Alien ", year=1979, director="Ridley Scott", genres=["Horror", " Fantascienza "],
                      poster_url="https://m.media-amazon.com/images/M/x._V1_QL75_UX300_.jpg")
    assert movie["title"] == "Alien"
    assert movie["director"] == "Ridley Scott"
    assert movie["genres"] == ["Horror", "Fantascienza"]
    assert movie["imdb_id"].startswith("tt")
    assert movie["user_name"] == user["name"]
    assert movie["watched"] is None

    # La modifica tocca solo note e utente: i dati IMDb restano com'erano.
    other = add_user()
    url = f"/api/movies/{movie['movie_id']}"
    body = {"notes": "in originale", "user_id": other["user_id"], "title": "Altro", "genres": ["Western"]}
    edited = client.put(url, json=body).json()
    assert edited["notes"] == "in originale"
    assert edited["user_name"] == other["name"]
    assert edited["title"] == "Alien"
    assert edited["genres"] == ["Horror", "Fantascienza"]

    watched = client.put(f"{url}/watched", json={"watched": True}).json()
    assert watched["watched"] is not None

    listed = [item["movie_id"] for item in client.get("/api/movies").json()]
    assert movie["movie_id"] in listed

    assert client.delete(url).json() == {"deleted": movie["movie_id"]}
    assert client.delete(url).status_code == 404


def test_same_imdb_movie_only_once(client, add_movie, user):
    movie = add_movie("Alien")
    body = {"imdb_id": movie["imdb_id"], "title": "Alien", "user_id": user["user_id"]}
    assert client.post("/api/movies", json=body).status_code == 409


def test_watched_movie_can_be_added_again(client, add_movie, created, add_user):
    first = add_movie("Alien")
    watch(client, first)

    # Riaggiunto, magari da un altro: riga nuova, candidata; la vecchia resta
    # nei visti e continua a contare per chi l'aveva proposto.
    other = add_user()
    body = {"imdb_id": first["imdb_id"], "title": "Alien", "user_id": other["user_id"]}
    res = client.post("/api/movies", json=body)
    assert res.status_code == 201
    again = res.json()
    created["movies"].append(again["movie_id"])
    assert again["movie_id"] != first["movie_id"]
    assert again["watched"] is None
    assert again["user_name"] == other["name"]

    rows = [m for m in client.get("/api/movies").json() if m["imdb_id"] == first["imdb_id"]]
    assert sorted(m["watched"] is None for m in rows) == [False, True]

    # Una seconda copia fra i da vedere no: ne' aggiunta, ne' rimettendo in
    # gioco quella vecchia.
    assert client.post("/api/movies", json=body).status_code == 409
    res = client.put(f"/api/movies/{first['movie_id']}/watched", json={"watched": False})
    assert res.status_code == 409


def test_invalid_movie_is_rejected(client, user):
    def post(**fields):
        body = {"imdb_id": fake_imdb_id(), "title": "X", "user_id": user["user_id"], **fields}
        return client.post("/api/movies", json=body)

    assert post(imdb_id="nm0000631").status_code == 422
    assert post(title="   ").status_code == 422
    assert post(poster_url="javascript:alert(1)").status_code == 422


def test_movie_needs_an_existing_user(client):
    body = {"imdb_id": fake_imdb_id(), "title": "X"}
    assert client.post("/api/movies", json=body).status_code == 422
    res = client.post("/api/movies", json={**body, "user_id": 999999999})
    assert res.status_code == 422
    assert res.json()["detail"] == "Utente non trovato"


def test_unknown_movie_is_404(client):
    assert client.put("/api/movies/999999999", json={"notes": "X"}).status_code == 404
    assert client.put("/api/movies/999999999/watched", json={"watched": True}).status_code == 404


# ---------- utenti ----------

def test_user_crud(client, add_user, add_movie):
    user = add_user("stefano")
    assert user["candidates"] == 0
    assert user["watched"] == 0

    url = f"/api/users/{user['user_id']}"
    renamed = client.put(url, json={"name": f"  {user['name']}-bis "}).json()
    assert renamed["name"] == f"{user['name']}-bis"

    # Il nome e' unico senza distinzione di maiuscole.
    other = add_user("simone")
    assert client.post("/api/users", json={"name": other["name"].upper()}).status_code == 409
    assert client.put(url, json={"name": other["name"].upper()}).status_code == 409

    # I conteggi seguono i film.
    movie = add_movie("Alien", owner=user)
    add_movie("Heat", owner=user)
    client.put(f"/api/movies/{movie['movie_id']}/watched", json={"watched": True})
    listed = {item["user_id"]: item for item in client.get("/api/users").json()}
    assert listed[user["user_id"]]["candidates"] == 1
    assert listed[user["user_id"]]["watched"] == 1

    # Con dei film non si cancella; senza, si'.
    assert client.delete(url).status_code == 409
    assert client.delete(f"/api/users/{other['user_id']}").json() == {"deleted": other["user_id"]}
    assert client.delete(f"/api/users/{other['user_id']}").status_code == 404


def test_user_name_is_required(client):
    assert client.post("/api/users", json={"name": "   "}).status_code == 422


# ---------- estrazione ----------

def test_draw_only_unwatched_of_genre(client, add_movie, genre):
    # Nessun film di questo genere: niente da estrarre.
    assert client.post("/api/draw", json={"genre": genre}).status_code == 409

    alien = add_movie("Alien", genre=genre)
    seen = add_movie("Heat", genre=genre)
    client.put(f"/api/movies/{seen['movie_id']}/watched", json={"watched": True})

    # Il genere filtra fra i generi di ogni film, senza distinzione di
    # maiuscole; Heat e' gia' visto.
    for _ in range(5):
        pick = client.post("/api/draw", json={"genre": genre.upper()}).json()
        assert pick["movie"]["movie_id"] == alien["movie_id"]

    history = client.get("/api/picks").json()
    assert history[0]["movie"]["title"] == "Alien"


def watch(client, movie):
    client.put(f"/api/movies/{movie['movie_id']}/watched", json={"watched": True})


def test_odds_weight_past_choices(client, add_user, add_movie, genre):
    lucky = add_user("fortunato")   # 3 film gia' visti: peso 1/4
    behind = add_user("indietro")   # nessuno: peso 1
    for title in ("A", "B", "C"):
        watch(client, add_movie(title, genre=genre, owner=lucky))
    add_movie("D", genre=genre, owner=lucky)
    # Quanti film si propongono non conta: tre candidati pesano come uno.
    for title in ("E", "F", "G"):
        add_movie(title, genre=genre, owner=behind)

    odds = {row["user_name"]: row for row in client.get("/api/draw/odds", params={"genre": genre}).json()}
    assert odds[behind["name"]]["probability"] == 0.8
    assert odds[behind["name"]]["candidates"] == 3
    assert odds[lucky["name"]]["probability"] == 0.2
    assert odds[lucky["name"]]["watched"] == 3


def test_draw_by_user(client, add_user, add_movie, genre):
    lucky = add_user("fortunato")
    behind = add_user("indietro")
    watch(client, add_movie("A", genre=genre, owner=lucky))
    lucky_movies = {add_movie(title, genre=genre, owner=lucky)["movie_id"] for title in ("B", "C")}
    add_movie("D", genre=genre, owner=behind)

    # Filtrando per utente esce solo lui, al 100%, anche se il peso lo sfavorirebbe.
    params = {"genre": genre, "user_id": lucky["user_id"]}
    odds = client.get("/api/draw/odds", params=params).json()
    assert [(row["user_name"], row["probability"]) for row in odds] == [(lucky["name"], 1.0)]

    drawn = {client.post("/api/draw", json=params).json()["movie"]["movie_id"] for _ in range(30)}
    assert drawn == lucky_movies  # a caso fra i suoi: in 30 giri escono entrambi

    # Un utente senza candidati (col genere scelto): niente da estrarre.
    other = add_user()
    assert client.post("/api/draw", json={"genre": genre, "user_id": other["user_id"]}).status_code == 409


def test_draw_follows_odds(client, add_user, add_movie, genre):
    lucky = add_user("fortunato")
    behind = add_user("indietro")
    for title in ("A", "B", "C"):
        watch(client, add_movie(title, genre=genre, owner=lucky))
    add_movie("D", genre=genre, owner=lucky)
    add_movie("E", genre=genre, owner=behind)

    # Atteso 80% a "indietro". Con 300 estrazioni la deviazione standard e'
    # ~2,3 punti: la forbice 70-90% e' oltre 4 sigma, non fallisce per caso.
    draws = 300
    wins = sum(
        client.post("/api/draw", json={"genre": genre}).json()["movie"]["user_name"] == behind["name"]
        for _ in range(draws)
    )
    assert 0.70 < wins / draws < 0.90


# ---------- IMDb, senza rete ----------

def test_resize_poster():
    url = "https://m.media-amazon.com/images/M/MV5BN2Nh@._V1_.jpg"
    assert imdb.resize_poster(url) == "https://m.media-amazon.com/images/M/MV5BN2Nh@._V1_QL75_UX300_.jpg"
    assert imdb.resize_poster(None) is None


def test_parse_search():
    payload = {"data": {"mainSearch": {"edges": [
        {"node": {"entity": {
            "id": "tt0078748",
            "titleText": {"text": "Alien"},
            "releaseYear": {"year": 1979},
            "primaryImage": {"url": "https://m.media-amazon.com/images/M/a._V1_.jpg"},
            "titleGenres": {"genres": [{"genre": {"text": "Horror"}}, {"genre": {"text": "Fantascienza"}}]},
            "directors": {"edges": [{"node": {"name": {"nameText": {"text": "Ridley Scott"}}}}]},
        }}},
        # senza anno, locandina, generi e regista
        {"node": {"entity": {
            "id": "tt0000001",
            "titleText": {"text": "Senza dati"},
            "releaseYear": None,
            "primaryImage": None,
            "titleGenres": None,
            "directors": {"edges": []},
        }}},
        # un risultato che non e' un titolo
        {"node": {"entity": {}}},
    ]}}}
    assert imdb.parse_search(payload) == [
        {"imdb_id": "tt0078748", "title": "Alien", "year": 1979,
         "poster_url": "https://m.media-amazon.com/images/M/a._V1_QL75_UX300_.jpg", "director": "Ridley Scott",
         "genres": ["Horror", "Fantascienza"]},
        {"imdb_id": "tt0000001", "title": "Senza dati", "year": None, "poster_url": None, "director": None,
         "genres": []},
    ]


def test_search_imdb_down_is_502(client, monkeypatch):
    async def failing(query):
        raise imdb.ImdbError("timeout")

    monkeypatch.setattr(imdb, "search", failing)
    res = client.get("/api/imdb/search", params={"q": "alien"})
    assert res.status_code == 502
    assert res.json()["detail"] == "IMDb non risponde, riprova fra poco"


def test_search_needs_two_chars(client):
    assert client.get("/api/imdb/search", params={"q": "a"}).status_code == 422
