from fastapi import APIRouter, HTTPException
from psycopg import errors

from app.dbmodels import users
from app.schemas import UserIn, UserOut

router = APIRouter(prefix="/api/users", tags=["utenti"])


def not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Utente non trovato")


def duplicate(name: str) -> HTTPException:
    return HTTPException(status_code=409, detail=f"Esiste gia' un utente {name}")


@router.get("", response_model=list[UserOut])
async def list_users():
    """Gli utenti, con quanti film hanno in gara e quanti gia' visti."""
    return await users.list_users()


@router.post("", response_model=UserOut, status_code=201)
async def add_user(body: UserIn):
    try:
        return await users.add_user(body.name)
    except errors.UniqueViolation:
        raise duplicate(body.name)


@router.put("/{user_id}", response_model=UserOut)
async def rename_user(user_id: int, body: UserIn):
    try:
        user = await users.rename_user(user_id, body.name)
    except errors.UniqueViolation:
        raise duplicate(body.name)
    if not user:
        raise not_found()
    return user


@router.delete("/{user_id}")
async def delete_user(user_id: int):
    try:
        deleted = await users.delete_user(user_id)
    except errors.ForeignKeyViolation:
        raise HTTPException(status_code=409, detail="L'utente ha dei film: assegnali a qualcun altro o eliminali prima")
    if not deleted:
        raise not_found()
    return {"deleted": user_id}
