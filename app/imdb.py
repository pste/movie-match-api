import re

import httpx

# Ricerca film su IMDb, tramite l'API GraphQL che usa il sito stesso.
#
# Non e' un'API pubblica documentata: IMDb ne consente un uso limitato, non
# commerciale (lo dice il campo "disclaimer" di ogni risposta), che e' il caso
# di un'app di casa. Senza Origin e x-imdb-client-name risponde 403.
# Una sola chiamata da' titolo e generi (in italiano, con x-imdb-user-language),
# anno, locandina e regista di ogni risultato, solo film (niente serie).
GRAPHQL_URL = "https://api.graphql.imdb.com/"

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://www.imdb.com",
    "x-imdb-client-name": "imdb-web-next-localized",
    "x-imdb-user-language": "it-IT",
    "x-imdb-user-country": "IT",
}

# I campi di un film: gli stessi per la ricerca e per la lettura di un id.
TITLE_FIELDS = """
    id
    titleText { text }
    releaseYear { year }
    primaryImage { url }
    titleGenres { genres { genre { text } } }
    directors: credits(first: 3, filter: {categories: ["director"]}) {
      edges { node { name { nameText { text } } } }
    }
"""

SEARCH_QUERY = f"""
query ($q: String!, $first: Int!) {{
  mainSearch(first: $first, options: {{searchTerm: $q, type: TITLE, includeAdult: false,
                                       titleSearchOptions: {{type: [MOVIE]}}}}) {{
    edges {{ node {{ entity {{ ... on Title {{ {TITLE_FIELDS} }} }} }} }}
  }}
}}
"""

TITLE_QUERY = f"""
query ($id: ID!) {{
  title(id: $id) {{ {TITLE_FIELDS} }}
}}
"""

RESULTS = 10
POSTER_WIDTH = 300
TIMEOUT_SECONDS = 8


class ImdbError(Exception):
    pass


# Le locandine IMDb sono su m.media-amazon.com, in originale anche da 2000 px.
# Il suffisso "._V1_<opzioni>.jpg" chiede al CDN una versione ridimensionata:
# a 300 px sono ~15 KB invece di ~1 MB.
def resize_poster(url: str | None, width: int = POSTER_WIDTH) -> str | None:
    if not url:
        return None
    return re.sub(r"\._V1_.*\.jpg$", f"._V1_QL75_UX{width}_.jpg", url)


def parse_title(title: dict) -> dict:
    directors = [item["node"]["name"]["nameText"]["text"] for item in title["directors"]["edges"]]
    genres = [item["genre"]["text"] for item in (title.get("titleGenres") or {}).get("genres") or []]
    return {
        "imdb_id": title["id"],
        "title": title["titleText"]["text"],
        "year": (title.get("releaseYear") or {}).get("year"),
        "poster_url": resize_poster((title.get("primaryImage") or {}).get("url")),
        "director": ", ".join(directors) or None,
        "genres": genres,
    }


def parse_search(payload: dict) -> list[dict]:
    edges = ((payload.get("data") or {}).get("mainSearch") or {}).get("edges") or []
    # Il frammento "... on Title" lascia vuoti i risultati di altro tipo.
    return [parse_title(edge["node"]["entity"]) for edge in edges if edge["node"]["entity"].get("id")]


async def query_imdb(query: str, variables: dict) -> dict:
    body = {"query": query, "variables": variables}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            res = await client.post(GRAPHQL_URL, json=body, headers=HEADERS)
            res.raise_for_status()
            payload = res.json()
    except (httpx.HTTPError, ValueError) as err:
        raise ImdbError(str(err)) from err
    if payload.get("errors"):
        raise ImdbError(payload["errors"][0].get("message", "errore GraphQL"))
    return payload


async def search(query: str) -> list[dict]:
    return parse_search(await query_imdb(SEARCH_QUERY, {"q": query, "first": RESULTS}))


# Un film per id: serve a ricompletare i film gia' in lista (backfill_genres.py).
async def get_title(imdb_id: str) -> dict | None:
    title = ((await query_imdb(TITLE_QUERY, {"id": imdb_id})).get("data") or {}).get("title")
    return parse_title(title) if title else None
