FROM python:3.12.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# INSTALL PACKAGES
# Prima delle sorgenti: un cambio al codice non rifa' l'installazione.
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# INSTALL APP
COPY app/ app/

# SECURITY CHECK
# Stesso uid del runAsUser dei pod k8s.
RUN useradd --uid 1000 --no-create-home --shell /usr/sbin/nologin app
USER 1000

EXPOSE 8000
# --proxy-headers: dietro Traefik l'IP del client arriva da X-Forwarded-For.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
