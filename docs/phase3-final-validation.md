# Phase 3 final release review

Code is intended for review in PR #1. Production approval is pending. The Phase 2 baseline is ab9fe19 on main. Render tracks commits on main and PR previews are off.

## Validation

| Area | Status and evidence |
| --- | --- |
| Local regression | Passed 16 tests including 180 seeded matches, room expiry, concurrent joins, hidden bets, duplicate actions, rate limiting and restart recovery. |
| Cold start | Passed simulated timeout and 503 followed by readiness. Create/join waits for a read-only 204 probe, with at most eight attempts, an eight-second limit per attempt and two seconds between attempts. Maximum wait is about 78 seconds before the mutation. The mutation is sent once and normal requests retain their eight-second timeout. No background wake-up traffic was added. Render cold start itself was not tested. |
| Security | Passed local authorized room flows, invalid Origin rejection, stale/duplicate/wrong-seat action checks, guest recovery and quota reset. npm audit reported zero findings. Existing Phase 2 HTTPS does not establish Phase 3 reverse proxy compatibility. Test invite and QR routes in the hosted candidate before release. Shared NAT/proxy callers can share the create/join quota. |
| PostgreSQL | CI verifies the authoritative match, application restart, and a controlled PostgreSQL container stop/start while the app remains up. See checks on PR #1 for results. |
| Browser | Passed Edge headless at 1440, 768, 390 and 360 CSS px. Tested 16 spaces, horizontal overflow, start, roll and reload with reduced motion enabled. Separate contexts passed online invite, ready, start, roll and guest refresh with two bots. |
| Not tested | Actual phone and safe-area behavior, real interrupted mobile connection, hosted Origin/cold start, and production load. |
| Blocked | Neon integration and live migration require an approved database connection and a separate release decision. |

## Performance

Run node scripts/phase3-load.mjs for the isolated loopback benchmark. CI also runs it against PostgreSQL 17. Three rooms hold 2, 4 and 8 humans (the two-human room has a bot to satisfy the three-seat minimum). Each room submits simultaneous copies of one action and verifies only one step advances. Then 30 overlapping polling waves produce 420 requests. Timers are disabled during this synthetic test.

Local SQLite: mean 5.85 ms, p95 7.75 ms, 0/420 errors, 1963.18 requests/s, app CPU 160.79% of one core, resident memory 77.63 MiB. A separate transaction plus SELECT 1 measured mean and p95 0.01 ms. The acceptance gate is zero errors and p95 below 500 ms. CPU and throughput describe a short burst on this machine. CI measures the shared advisory lock under local PostgreSQL traffic. Hosted RTT, timed jobs and Neon quotas require separate staging verification.

## Visual comparison

Compare the same game seed using the Phase 2 stylesheet and the current stylesheet. Images are in [phase3-images](phase3-images). The current version adds track texture, facial highlights, clearer match and player rows, and larger touch actions.

## Manual UAT on real devices

- Open the hosted candidate link by URL and QR on iOS Safari and Android Chrome. Wait for the lobby if the service starts cold. Confirm one tap creates or joins one room and feedback is visible while waiting.
- Check portrait, landscape and safe-area spacing. Scroll between actions and score. Confirm cats, stack order, turn timer, betting controls, warnings and results stay readable.
- Turn on reduced motion. Check menus and keyboard focus on desktop and verify dice feedback on a roll.
- With two guests, refresh while waiting, disconnect during a turn and reconnect after bot takeover. Confirm guest seat, turn, score and board match on both phones.
- Finish a game and confirm final scores and the winner on both devices.

## Production release checklist and rollback

- [ ] Owner approves isolated Neon staging and provides a TLS URI via the secret store. Set DATABASE_URL only there. Keep BEDGORM_DB for local SQLite and use BEDGORM_TEST_POSTGRES_URL only with disposable databases.
- [ ] Validate pool connectivity, application restart, proxy Origin, cold start, mobile UAT and representative concurrent rooms on staging.
- [ ] Verify the source SQLite backup is consistent and still exists. Import into empty staging using node server/import-sqlite.mjs PATH_TO_BACKUP. The script verifies foreign keys and compares imported counts within the transaction. Compare representative versions, scores, results and reconnect using an existing authorized guest.
- [ ] Verify clean backup, restore, and rollback rehearsal. Follow [the Phase 3 rollback plan](phase3-qa.md#migration-and-rollback), including write reconciliation if PostgreSQL has already received moves.
- [ ] Obtain separate approval before merging, changing the production database or deploying. Render auto-deploy on main makes the merge itself a deployment decision.
