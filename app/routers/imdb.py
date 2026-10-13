import logging

from fastapi import APIRouter, HTTPException, Query

from app import imdb
from app.schemas import ImdbResult

router = APIRouter(prefix="/api/imdb", tags=["imdb"])
log = logging.getLogger(__name__)


@router.get("/search", response_model=list[ImdbResult])
async def search(q: str = Query(min_length=2, max_length=100)):
    """Cerca film su IMDb per titolo: titolo, anno, locandina e regista."""
    try:
        return await imdb.search(q.strip())
    except imdb.ImdbError as err:
        log.warning("ricerca IMDb fallita: %s", err)
        raise HTTPException(status_code=502, detail="IMDb non risponde, riprova fra poco")
