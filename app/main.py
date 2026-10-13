from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import db
from app.routers import imdb, movies, picks, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.open_pool()
    yield
    await db.close_pool()


# Tutte le rotte stanno sotto /api: in produzione l'ingress manda /api qui e il
# resto alla UI, sullo stesso host; in sviluppo fa lo stesso il proxy di Vite.
# Per questo non serve CORS.
app = FastAPI(
    title="movie-match API",
    description="Lista film ed estrazione casuale.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.include_router(imdb.router)
app.include_router(users.router)
app.include_router(movies.router)
app.include_router(picks.router)


# Non tocca il database: e' la probe di k8s, e un Postgres lento non e' un
# motivo per riavviare l'API.
@app.get("/api/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok"}
