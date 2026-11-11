# E-INT gate record

Local gates ran on merge `16b49e755158dee6c7f1149fe93ceaa0def50c42`, tree `0b7bc43c9f2b7a9f0add181bf98baf562b39a49e`, with a clean tracked worktree. The subsequent evidence commit contains only these integration documents and JSON; all tested production bytes remain unchanged. [E_INT_GATE.json](E_INT_GATE.json) records all 268 production source hashes, checkpoint hashes, commands, exit codes, timings and environment.

The complete local sequence passed: `npm ci`; `test:core`; `test:g8`; `test:c1`; `test:wanxiang`; `test:wanxiang:b`; `test:wanxiang:c`; `test:wanxiang:d`; `test:wx-e0`; `test:wx-e1`; `test:save-equivalence`; `test:three-realms`; `build`; `test:package`. No assertion, command, Fast Gate or Heavy Gate was removed or weakened.

An initial installation failed with EPERM in the system npm cache before any gate ran. That failure is retained under `reports/local/e-int/gate-failed-global-cache.json` and `ci-failed-global-cache.log`. The successful retry uses process-local `npm_config_cache=<worktree>/.cache/npm`; no global cache, global npm configuration or upstream checkout was changed. `node_modules` and cache paths were checked to remain inside the task worktree before the install.

Environment: Windows 10.0.26200; Node v24.11.1; npm 11.6.2; AMD Ryzen 9 8940HX, 32 logical processors. The successful sequence finished at 2026-11-11T11:31:12.069Z. These are correctness gates, not a performance measurement. Browser, GPU, Top25 and optimization results are not claimed by this record.

The anchor is not released for A/B implementation until the final pushed documentation HEAD itself passes the unchanged full Fast Gate and Heavy Gate. The Draft PR and its exact-head Actions run are the authoritative remote acceptance. No main merge is requested or performed.
