FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# The dev server proxies /api to the backend, so binding it to every interface would
# expose the API even when the backend itself is on loopback. Override with
# FRONTEND_HOST if you deliberately want the UI reachable from another machine.
CMD npm run dev -- --host ${FRONTEND_HOST:-127.0.0.1}
