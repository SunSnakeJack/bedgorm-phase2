# Phase 3 QA and operations

Baseline: main and Render are on ab9fe19. Render auto-deploys commits on main, and PR previews are off. Phase 3 is reviewed via PR #1.

| Area | Status | Evidence |
| --- | --- | --- |
| Game rules and bots | Passed | Existing regression suite includes 180 seeded games, stacking, reverse moves, scoring and all three bot levels in an HTTP match. |
| Multiplayer on SQLite | Passed | Independent sessions join, recover with the same token after server restart, and finish a game. Tests cover duplicate submissions, stale versions, timeout, takeover, hidden bets, concurrent joins and room expiry. |
| Security | Passed for tested controls | Invalid origins return 403. Cross-session actions and hidden betting are covered. Create/join quota returns 429 and resets. npm audit reported zero vulnerabilities. |
| PostgreSQL | See PR CI | CI runs the full authoritative match and application restart against PostgreSQL 17. A PostgreSQL process restart and Neon are not tested. |
| Browser | Passed for tested flow | Edge headless at 1440 and 390 CSS pixels, fixed seed 42. Local play starts, rolls and restores across reload. Both widths show all 16 spaces without horizontal overflow. |
| Remaining QA | Not tested | Real mobile hardware, browser multiplayer reconnect over an interrupted connection, production load, and a live SQLite-to-Neon migration. |
| Hosted validation | Blocked | Requires user-approved Neon connection and separate deployment approval. |

## Security and capacity

The server owns score, dice and action eligibility. Guest tokens are random and stored as hashes. The database commits game state, action version and result together. The new process-local quota allows 60 create/join requests per socket address per minute. A shared proxy or NAT can share that limit. Forwarding headers are deliberately ignored until a trusted proxy path is verified. Operational logs avoid emitting SQL and connection details from unexpected request and tick errors.

Polling stays at 1.1 s (about 0.91 requests per active client per second). PostgreSQL uses a four-connection pool and a database-wide transaction lock to keep ticks and actions ordered even across app processes. This trades throughput for simple consistency in a small group. Measure p50/p95 HTTP and SQL latency, pool saturation, memory and CPU under representative concurrent rooms before increasing scale. Frequent timers may keep a database compute active while the app is running. Check free-tier usage in the Neon dashboard before rollout. No wake-up traffic is added.

## Database setup

Run npm ci. SQLite remains the default and BEDGORM_DB selects its file. For PostgreSQL, set DATABASE_URL only in the approved environment secret store. Use the Neon connection URI with TLS enabled. The app creates its six tables on startup and needs schema creation permission for initialization. Use an isolated database for staging. Set BEDGORM_TEST_POSTGRES_URL only for a disposable local PostgreSQL test database. Never point tests at production.

## Migration and rollback

1. Confirm deployed version and confirm the SQLite file still exists. Suspend writes and take a consistent SQLite backup that includes WAL changes. Keep it encrypted and check its integrity.
2. With DATABASE_URL pointing at an empty staging database, run `node server/import-sqlite.mjs PATH_TO_BACKUP`. It preserves Guest hashes, identifiers and records. It rejects a nonempty destination and imports in one transaction.
3. Compare table counts, latest game versions and results. Verify an existing Guest can reconnect, an action can be submitted once, and state survives application restart. Rehearse the cutover before requesting approval for production.
4. On approval, repeat from a fresh backup while writes are paused, set the secret in the target environment, deploy the approved revision and verify before resuming writes.
5. If rollback is needed before PostgreSQL accepts writes, restore the previous configuration and backup. If PostgreSQL has accepted writes, pause writes and reconcile them before returning to SQLite. Keep both backups until acceptance.

## Visual changes

The board gains a softer patterned surface and inset edges. Cat faces have more visible detail. Match information and player rows gain separation, and touch actions have 44 px minimum height. Dice animation is more pronounced and respects the OS reduced-motion preference. The before/after captures use the same board seed and substitute the Phase 2 stylesheet for the before images.
