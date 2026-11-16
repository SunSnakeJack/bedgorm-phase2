# Bedgorm Phase 2 — Render Free (for temporary testing)

**Important:** This config does not perform deployment automatically. It prepares the original Bedgorm Node.js + SQLite application for Render Free and does not touch the existing ChatGPT Sites Phase 1 URL.

## Files added
- `render.yaml` — Blueprint for one free Node web service in Singapore, build+tests, manual auto-deploy policy.
- `.node-version` — Node 24.22.1 (the app requires >=24.2).
- This guide. The game code and rules were not modified.

## Deploy
1. Create a **private GitHub repository** for this Phase 2 test, and upload all extracted files to the repository root (`render.yaml`, `.node-version`, `package.json`, `dist/`, `server/`, `test/`). Do not upload SQLite databases or tokens; `.gitignore` already excludes SQLite files.
2. Sign in to Render and connect the GitHub repo. From the Render dashboard, choose **New → Blueprint**, select your repo and review the service config. Verify `plan: free` before approving creation.
3. Alternatively, choose **New → Web Service** with the same repository, Node runtime, Free plan, Build `npm install && npm test`, Start `npm run dev`, and environment variables `NODE_VERSION=24.22.1`, `BEDGORM_HOST=0.0.0.0`, `BEDGORM_DB=/tmp/bedgorm-online.sqlite`.
4. After the deployment is **Live**, open the Render `https://...onrender.com/` address, select online game, create room, and invite another browser profile or device.
5. Test two independent profiles and two phones, plus a full match, Refresh/Reconnect and bots. The existing Sites Phase 1 URL remains unchanged.

## Important limitations
- **Render Free has an ephemeral filesystem.** `BEDGORM_DB=/tmp/...` intentionally stores temporary test data. A restart/redeploy/sleep may erase room codes, Guest sessions, games, and scores. Do not promise persistent matches.
- Free web services may go idle after 15 minutes with no incoming requests, then take time to restart.
- Render Free is publicly reachable at its onrender.com URL, even if your GitHub repo is private. Treat it as an experimental URL for invited testers, not a private site.
- This application's sync is HTTP polling (~1.1s), **not WebSocket**. Works on one process, but the source lacks public rate limiting and a durable external DB, so do not use for production/public load.
- Render Free persistent disks are not available. For durable data, later migrate to a free cloud database with a suitable backend driver; this requires actual code changes.
- Existing personal ChatGPT Sites may remain Phase 1; this deployment is an independent Phase 2 app with its own URL.
