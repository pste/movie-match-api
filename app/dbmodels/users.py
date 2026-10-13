from app.db import fetch_all, fetch_one

# Ogni utente con quanti film ha ancora in gara e quanti ne sono gia' stati
# visti: il secondo numero e' quello che pesa nell'estrazione (picks.py).
SELECT_USERS = """
    SELECT u.user_id, u."name",
           count(m.movie_id) FILTER (WHERE m.watched IS NULL) AS candidates,
           count(m.movie_id) FILTER (WHERE m.watched IS NOT NULL) AS watched
    FROM users u
    LEFT JOIN movies m ON m.user_id = u.user_id
"""


async def list_users() -> list[dict]:
    return await fetch_all(SELECT_USERS + ' GROUP BY u.user_id ORDER BY lower(u."name")')


async def get_user(user_id: int) -> dict | None:
    return await fetch_one(
        SELECT_USERS + " WHERE u.user_id = %(user_id)s GROUP BY u.user_id",
        {"user_id": user_id},
    )


# Un nome gia' usato (senza distinzione di maiuscole) solleva UniqueViolation:
# la gestisce il router.
async def add_user(name: str) -> dict:
    row = await fetch_one(
        'INSERT INTO users ("name") VALUES (%(name)s) RETURNING user_id',
        {"name": name},
    )
    return await get_user(row["user_id"])


async def rename_user(user_id: int, name: str) -> dict | None:
    row = await fetch_one(
        'UPDATE users SET "name" = %(name)s WHERE user_id = %(user_id)s RETURNING user_id',
        {"user_id": user_id, "name": name},
    )
    if not row:
        return None
    return await get_user(user_id)


# Un utente con dei film solleva ForeignKeyViolation (ON DELETE RESTRICT):
# la gestisce il router.
async def delete_user(user_id: int) -> bool:
    row = await fetch_one(
        "DELETE FROM users WHERE user_id = %(user_id)s RETURNING user_id",
        {"user_id": user_id},
    )
    return row is not None
