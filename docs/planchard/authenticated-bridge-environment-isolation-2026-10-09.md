# Authenticated bridge environment isolation

The bounded full suite reported `authenticated external bridge relays one MCP call to the browser and back` in `tests/agent_bridge.test.mjs`. The initial full log remains `scratch/planchard/test-bounded-2026-10-09-current.log`; that ongoing suite is parent-owned and this note does not assert its final result.

The unchanged test was rerun independently inside the restricted sandbox: **0/1 passed**, failure `Error: relay did not start` at `waitForServer`, before authentication or MCP roundtrip assertions. Duration2006.8423 ms. The fixture launches a temporary Node relay on an ephemeral127.0.0.1 port with a fixture-only token and temporary identity file, then kills the child and removes that file.

Historical `shaper-tool-head-8.20-validation-2026-10-09.md` records the same local relay environment restriction among13 failures, followed by an authorized identical outside-sandbox environment rerun34/34 passing. On this current tree the identical command `node --test tests/agent_bridge.test.mjs` was approved and rerun outside the sandbox: **1/1 passed**, zero failed, duration266.0192 ms; the test itself184.2587 ms. Its unauthorized poll401, authenticated browser poll/call/reply and response assertions all passed unchanged.

Classification: restricted relay startup, not a reproduced app authentication/bridge regression. No application source, authentication/origin logic, test timeouts or tests were changed. The full-suite failure remains documented rather than silently removed; parent may account for this verified environment exception in the completed bounded result.
