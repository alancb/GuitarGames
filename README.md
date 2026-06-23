# Chord Current

Static guitar-practice mini-games inspired by chord-controlled arcade play. The site is built with Vite, TypeScript, and Canvas 2D, runs entirely in the browser, and stores calibration plus high scores only in local browser storage.

Live site: [https://alancb.github.io/GuitarGames/](https://alancb.github.io/GuitarGames/)

## What It Includes

- Four-chord microphone calibration with browser-local persistence
- Snake controlled by chord-triggered directions
- Fruit Slash controlled by chord-triggered matching hits
- Static GitHub Pages deployment

## Local Development

Requirements:

- Node.js 24+
- npm 11+

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Preview the production build locally:

```bash
npm run build
npm run preview
```

Run tests:

```bash
npm run test
```

## Deployment

GitHub Actions builds and deploys the contents of `dist/` to GitHub Pages on every push to `main`.

The deployment workflow lives at `.github/workflows/deploy.yml`.
