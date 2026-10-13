from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import settings

# Un pool solo per tutto il processo, aperto e chiuso dal lifespan di main.py.
pool: AsyncConnectionPool | None = None


async def open_pool() -> None:
    global pool
    conninfo = make_conninfo(
        host=settings.pghost,
        port=settings.pgport,
        dbname=settings.pgdatabase,
        user=settings.pguser,
        password=settings.pgpassword,
    )
    # dict_row: ogni riga arriva come dict, pronta per i modelli Pydantic.
    pool = AsyncConnectionPool(conninfo, min_size=1, max_size=5, open=False, kwargs={"row_factory": dict_row})
    await pool.open()


async def close_pool() -> None:
    if pool:
        await pool.close()


# Ogni chiamata e' una transazione: pool.connection() fa commit all'uscita, o
# rollback se la query solleva un'eccezione.
async def fetch_one(sql: str, params: dict | None = None) -> dict | None:
    async with pool.connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchone()


async def fetch_all(sql: str, params: dict | None = None) -> list[dict]:
    async with pool.connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchall()
