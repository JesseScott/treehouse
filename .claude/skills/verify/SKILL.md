---
name: verify
description: Run treehouse's full check ladder (npm run verify) and summarise the report. Use before committing, when asked to validate or verify a change, or to see the current test, bundle-size and Lighthouse numbers.
---

# Verify treehouse

1. From the repository root run `npm run verify`. It takes about half a minute on the empty shell and longer as the
   app grows; run it in the background if it is likely to pass two minutes. If Playwright reports a missing browser,
   run `npx playwright install chromium` once and try again.
2. Read `reports/verify.md` and `reports/verify.json`. Do not rely on the exit code alone.
3. For every failed step, read `reports/logs/<step>.log`. For a failed end-to-end test, look at its screenshot and
   trace under `reports/e2e/artifacts/` and at `reports/e2e/screenshots/`.
4. Report to the user, briefly:
   - the verdict (PASSED or FAILED), the commit, and whether there were uncommitted changes;
   - one line per step with its result and time;
   - test counts (unit, end-to-end, smoke);
   - each metric with its value and budget, calling out any within 5% of its budget;
   - for each failure: what failed, the relevant lines of the log, and what you think the cause is.
5. If something failed, do not commit. Fix it and run the ladder again, or say plainly what is still failing.

Narrower runs while working: `npm run check:fast` (seconds), `npm run check:e2e`, `npm run check:perf`.
`docs/HARNESS.md` describes every file in `reports/` and the debug API the tests use.
