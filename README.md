# Game Recommendation System

A full-stack university capstone project for game recommendations.

## Features
- JWT Authentication with username and password
- Game Search & Browse (IGDB integration)
- Price tracking (CheapShark integration)
- Personal Library & Wishlist
- Content-based Recommendation Engine

## Commands
- `npm install`: Install dependencies for root, frontend, and backend.
- `npm run setup`: Generates Prisma client, pushes schema, and seeds database.
- `npm run dev`: Runs frontend and backend concurrently.
- `npm run build`: Builds the frontend and backend for production.
- `npm run start`: Starts the production backend. If `frontend/dist` exists, the backend also serves the React app.

## Catalog Imports
- `npm run catalog --prefix backend`: Imports store catalog games and prices.
- `npm run lizardbyte --prefix backend`: Imports missing games from LizardByte/GameDB.
- The local SQLite database file is not committed to GitHub. Run imports on the production database after deployment.

## Production / Domain Checklist
1. Build the project with `npm run build`.
2. Set backend environment variables:
   - `NODE_ENV=production`
   - `JWT_SECRET` with at least 32 random characters
   - `DATABASE_URL`
   - `FRONTEND_URL=https://yourdomain.com` if frontend is hosted separately
3. If frontend and backend are on the same domain, leave `VITE_API_URL` empty so the app calls `/api`.
4. If the API is on another domain, set `VITE_API_URL=https://api.yourdomain.com/api` before building the frontend.
5. Point your domain DNS to the hosting provider, enable HTTPS, then run the backend with `npm run start`.

## Render Deployment
This repository includes `render.yaml` for a one-service deploy:

- The React frontend is built with Vite.
- The Express backend serves both `/api` and the built frontend.
- SQLite is stored on a persistent Render disk at `/var/data/dev.db`.

Deploy steps:
1. Push this repo to GitHub.
2. In Render, create a new Blueprint from this repository.
3. Set `JWT_SECRET` to a random value with at least 32 characters.
4. Deploy the service.
5. After the first deploy, open a Render shell and run the catalog imports if the production database is empty:
   - `npm run catalog --prefix backend`
   - `npm run lizardbyte --prefix backend`

The local `backend/prisma/dev.db` file is intentionally ignored and is not uploaded to GitHub.
