from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # I nomi sono quelli di libpq (PGHOST, PGPORT, ...): pydantic-settings non
    # distingue maiuscole e minuscole, quindi PGHOST valorizza pghost.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    pghost: str = "localhost"
    pgport: int = 5432
    pgdatabase: str = "moviematch"
    pguser: str = "moviematch"
    pgpassword: str = ""


settings = Settings()
