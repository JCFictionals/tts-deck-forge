# TTS Deck Forge

Source for [TTS Deck Forge](https://commander-tts-deck-forge.jcfictionals.chatgpt.site), a browser-based Magic deck builder and Tabletop Simulator import tool.

## Run locally

The app uses a server worker for deck URL imports and other API routes. Its complete worker is `dist/server/index.js`. With Node.js installed, start a local server and open `http://localhost:8787`:

```bash
node scripts/serve-local.mjs
```

The `.openai/hosting.json` file identifies the existing Sites project.

The project has no package installation step. Use Node.js to run the included checks and regenerate bundled files:

```bash
node scripts/test-site-validation.mjs
node scripts/test-tts-import.mjs
node scripts/test-deck-url-input.mjs
node scripts/build-tts-importer.mjs
node scripts/build-worker.mjs
```

The build scripts write the TTS importer JSON and the worker bundle in `dist/`. The `dist/` files are committed because they are the files served by the existing Site.

## GitHub and Sites

This repository is a source snapshot of the existing Sites project. Publishing commits to GitHub does not automatically update the live Site. To make future Site edits, open the project in Sites and apply or deploy those changes there as well.
