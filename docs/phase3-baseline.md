# Bedgorm Phase 3 baseline and implementation notes

## Baseline

- GitHub main at inspection: `ab9fe19ede59cf96a6e299ba215e658de2605669`.
- Ubuntu CI uses the runtime pinned by `.node-version`. Local Phase 2 regression: 12 passed, including 180 completed seeded matches and an HTTP match with two independent Guest sessions and all three bot levels.
- Phase 3 adds a concurrent join case with two vacant seats and three requests. Local regression: 13 passed. npm audit reported zero vulnerabilities with the current lockfile. GitHub Actions has not run yet.
- Render deploy SHA and live Auto Deploy setting are unverified. The checked-in blueprint sets Auto Deploy to off for `bedgorm-phase2-demo`; the requested live service is `bedgorm-phase2`.

## Multiplayer

`dist/engine.mjs` implements rules shared by local play and the server. The server commits authoritative snapshots and action records in the same SQLite transaction. A room/player action ID and a unique room/version pair are the replay and concurrency boundaries. Guest tokens are random and stored as hashes on the server. The client stores the Guest session for refresh recovery and polls roughly every 1.1 seconds.

Keep polling for this iteration. Measure response latency, database transaction time, process RSS and CPU with concurrent rooms before considering a transport change. One visible active client nominally generates about 0.91 polls per second. The actual limit on Render is unmeasured. Test bounded request duration and ambiguous action responses, preserving the original action ID on retry. Check session recovery and separate recovery after browser refresh from recovery after a process restart.

## Persistence

Keep SQLite local. Add PostgreSQL behind the same transaction and query boundary, with a PostgreSQL pool and one transaction-scoped connection. Serialize writes and timer advancement for each room. Move expiry cleanup and scheduled work out of broad write transactions, and ensure multiple workers cannot advance the same turn. Keep all six tables, cascading foreign keys, action IDs, version uniqueness and atomic result recording. Tests must cover both backends and a PostgreSQL server restart.

Before live migration, identify the deployed commit and check whether its SQLite database is still present. Pause writes during cutover and take a consistent SQLite backup including WAL changes. Import rooms, players, guest sessions, games, actions and results in dependency order into an isolated PostgreSQL database. Validate counts, foreign keys, latest room versions, results and Guest recovery. Store the connection string only in hosted secrets. Retain an encrypted backup and the previous service configuration. After any writes to PostgreSQL, reconcile those writes before switching back to SQLite. No live migration has been rehearsed.

## UX and production QA

Capture before and after views of a full board, action panel, scoreboard, lobby and results at desktop and mobile widths. Keep all 16 spaces, stack ordering and game timing. Exercise keyboard focus, touch, safe area and reduced motion. Verify with isolated browser contexts and report real-device coverage separately.

Security review should verify room-scoped authorization, replay rejection, bounded requests, rate limits, server-owned randomness and pre-finish betting privacy. Avoid recording credentials, tokens or request bodies in operational telemetry. Production readiness remains unverified until PostgreSQL, browser and hosted checks run.
