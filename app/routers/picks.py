from fastapi import APIRouter, HTTPException, Query

from app.dbmodels import picks
from app.schemas import DrawIn, OddsOut, PickOut

router = APIRouter(prefix="/api", tags=["estrazioni"])


@router.post("/draw", response_model=PickOut, status_code=201)
async def draw(body: DrawIn):
    """Estrazione equa: sceglie un utente pesato su quanti suoi film sono gia' stati
    visti, poi un suo film a caso fra quelli da vedere. La registra nello storico.
    Filtri facoltativi: genere e utente (con l'utente e' a caso fra i suoi film)."""
    pick = await picks.draw(body.genre, body.user_id)
    if not pick:
        raise HTTPException(status_code=409, detail="Nessun film da estrarre")
    return pick


@router.get("/draw/odds", response_model=list[OddsOut])
async def odds(genre: str | None = Query(None, max_length=40), user_id: int | None = None):
    """Probabilita' attuale di ogni utente all'estrazione, con gli stessi filtri."""
    return await picks.odds(genre.strip() if genre and genre.strip() else None, user_id)


@router.get("/picks", response_model=list[PickOut])
async def list_picks(limit: int = Query(20, ge=1, le=100)):
    """Le ultime estrazioni, dalla piu' recente."""
    return await picks.list_picks(limit)
