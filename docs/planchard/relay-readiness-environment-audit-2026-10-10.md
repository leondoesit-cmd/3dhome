# External bridge readiness failure investigation

The isolated `tests/agent_bridge.test.mjs` failure previously said **relay did not start**. Read-only reproduction starts the exact Node child command on a free localhost port, captures stdout/stderr and probes `/api/ping`. The child remains running, emits its relay/app listening message and has empty stderr. The requesting test process's fetch fails with underlying **EACCES**. This is evidence of an execution-environment network-access restriction, not evidence of a relay startup or authentication defect.

No application, relay, authentication, allowed-origin, binding or security behavior changed. The integration test still fails in this restricted environment. It is neither skipped nor reported as passed.

A bounded test-only helper now preserves the last HTTP status or fetch cause and checks early child exit. `tests/agent_bridge.test.mjs` uses it instead of swallowing every readiness error and claiming startup failure. Three focused tests pass: temporary HTTP unavailability followed by readiness; a running child with denied fetch access still failing with EACCES; and early exit/nonhealthy HTTP diagnostics. The isolated combined run is **3 passed /1 failed**, with the expected integration failure explicitly reporting **fetch failed (EACCES); child has not exited**. No full suite was rerun.

Changed files: `tests/helpers/relay_readiness.mjs`, `tests/relay_readiness.test.mjs`, `tests/agent_bridge.test.mjs`. Gates passed: no free identifiers,664 linked modules,1489 source assertions. `git diff --check` reports only a normal line-ending notice. This report does not establish external bridge end-to-end acceptance in the restricted execution environment.
