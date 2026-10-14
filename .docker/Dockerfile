FROM node:24.13.0-alpine

# SETUP npm
RUN npm config set engine-strict true

# INSTALL PACKAGES
# Prima delle sorgenti: un cambio al codice non rifa' l'installazione.
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json .
RUN npm ci --omit=dev

# INSTALL APP
COPY app.js .
COPY src/ src/

# SECURITY CHECK
# L'utente node dell'immagine ha uid 1000, lo stesso del runAsUser dei pod k8s.
RUN chown -R node:node /app
USER node

EXPOSE 8000
# node direttamente e non "npm run prod": npm non inoltra SIGTERM, e k8s
# aspetterebbe il timeout prima di uccidere il pod.
CMD ["node", "app.js"]
