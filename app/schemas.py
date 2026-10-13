from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

Genre = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


# Gli spazi in testa e in coda non fanno parte di un valore: un titolo di soli
# spazi non e' un titolo, e " Stefano" e "Stefano" sono lo stesso nome.
class TrimmedModel(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def strip_strings(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if value == "":
                return None
        return value


# ---------- IMDb ----------

# Un risultato della ricerca IMDb, ed e' anche quello che la UI rimanda per
# aggiungere il film scelto alla lista.
class ImdbResult(TrimmedModel):
    imdb_id: str = Field(pattern=r"^tt\d{5,10}$")
    title: str = Field(min_length=1, max_length=200)
    year: int | None = Field(default=None, ge=1880, le=2100)
    poster_url: str | None = Field(default=None, max_length=500, pattern=r"^https://")
    director: str | None = Field(default=None, max_length=200)
    # Di solito da uno a tre ("Horror", "Fantascienza").
    genres: list[Genre] = Field(default_factory=list, max_length=10)


# ---------- utenti ----------

class UserIn(TrimmedModel):
    name: str = Field(min_length=1, max_length=40)


class UserOut(BaseModel):
    user_id: int
    name: str
    candidates: int  # film ancora in gara
    watched: int     # film gia' visti: piu' sono, meno pesa nell'estrazione


# ---------- film ----------

# Il risultato IMDb scelto, piu' chi lo propone: obbligatorio.
class MovieCreate(ImdbResult):
    user_id: int


# Titolo, anno, locandina, regista e generi vengono da IMDb e non si
# modificano: note e utente sono i campi nostri. user_id resta facoltativo per
# i film nati prima degli utenti.
class MovieUpdate(TrimmedModel):
    notes: str | None = Field(default=None, max_length=500)
    user_id: int | None = None


class WatchedIn(BaseModel):
    watched: bool


class MovieOut(BaseModel):
    movie_id: int
    imdb_id: str
    title: str
    year: int | None
    poster_url: str | None
    director: str | None
    genres: list[str]
    notes: str | None
    user_id: int | None
    user_name: str | None  # chi l'ha proposto
    created: datetime
    watched: datetime | None


# ---------- estrazioni ----------

class DrawIn(TrimmedModel):
    # Filtro facoltativo: estrae solo fra i film di questo genere.
    genre: str | None = Field(default=None, max_length=40)
    # Filtro facoltativo: estrae solo fra i film proposti da questo utente.
    user_id: int | None = None


# Le probabilita' attuali di un utente all'estrazione. user_id e user_name
# sono None per il gruppo dei film senza utente.
class OddsOut(BaseModel):
    user_id: int | None
    user_name: str | None
    candidates: int
    watched: int
    probability: float


class PickOut(BaseModel):
    pick_id: int
    picked: datetime
    movie: MovieOut
