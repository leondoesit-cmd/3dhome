# Motion playback timing investigation, 2026-11-06

The failure at the original `tests/motion_playback_fast.test.mjs:482` is an
unstable wall-clock assertion under competing CPU work. These measurements do
not show a playback copy-cost regression. This change updates the test only;
production playback and solver code were not changed by this investigation.

Measurements used the existing working tree, including its uncommitted solver
state and worker changes, rather than reverting to Git HEAD. Those edits and
the test's existing worker-adapter edits were preserved. Environment: Node
v24.19.0, Windows build 26200, Ryzen 7 5700X3D (8 cores / 16 logical processors).

## Original failure and isolated reproduction

The supplied `%TEMP%/modelforge-final-suite.tap` records 5,976 tests: 5,972
passes, three skips and one failure. Its sole failure is the copy-cost assertion
in the frame comparison test, after 87.595 seconds. All 167 frame comparisons
had already passed, including the final synthetic fixture's poses, studies,
mates, times and single immutable worker-graph transfer.

The failing fixture was Synthetic 50/80. The original guard requires
`afterCopy < beforeCopy * 0.8 + 0.5` (milliseconds per frame), where copy cost is
the sum of `structuredClone` and `JSON.stringify` wall time outside the solver.

| Original test measurement | Before copy | After copy | Allowed after |
| --- | ---: | ---: | ---: |
| Supplied parallel-suite report | 6.699 | 7.841 | <5.859 |
| Unmodified isolated reproduction | 3.111 | 2.475 | <2.989 |

The unmodified file passed 7/7 tests in 36.461 seconds; the frame comparison
itself took 30.719 seconds. The synthetic solver also changed direction with
load: 25.776 -> 31.466 ms/frame in the supplied report, versus 10.520 -> 9.843
isolated. Both variants call the same native solver. Sequential before/after
wall-clock measurements charge unrelated descheduling to whichever operation
happens to be interrupted; a fixed additive allowance cannot bound that delay.

## Test change

The test still compares every frozen/current frame and retains all existing
direct seek, rollback, cancellation, worker revision, own-property and real
module-worker checks. Neither performance threshold changed:

- Total cost: `after < before * 2 + 2` ms/frame, now using current-thread CPU
  time over each complete seek rather than elapsed wall time.
- Copy cost: `after < before * 0.8 + 0.5` ms/frame, now using batched CPU time.

During the actual frame sequence, the instrumentation records frozen arguments
for every non-solver clone/stringify operation. Recording uses the native clone,
and its overhead is excluded from the reported frame totals. The copy benchmark
replays these actual operations, with their original frequency and input sizes,
after the instrumentation has been restored. It does not substitute a smaller
synthetic payload or repeat the expensive mate solve.

The benchmark warms both workloads, alternates before/after ordering, then takes
the median of five samples for each variant. Each sample repeats the complete
recorded frame sequence until it consumes at least 250 ms of thread CPU time.
All five samples are printed. A local resolution probe found 15,000/16,000 us
steps in Windows thread CPU counters, so timing individual sub-ms copies with
those counters would not be reliable. The broad total-cost guard aggregates
whole-seek CPU measurements; the precise copy guard uses the longer batches.

[`process.threadCpuUsage()`](https://nodejs.org/docs/latest-v24.x/api/process.html#processthreadcpuusagepreviousvalue)
counts user plus system CPU for the current thread, excluding time descheduled
and CPU used by other threads. It is available in the repository's Node 24+
runtime. Cache contention, CPU frequency and main-thread GC can still change
CPU cost, which is why both workloads are repeatedly compared on the same host.

Batching adds at least ten seconds of CPU work across the four fixtures. The
updated isolated file took 49.153 seconds and passed 7/7 tests.

## Contention and controls

The updated file was run with 16 additional worker threads continuously doing
integer arithmetic, one competitor per logical processor. Only this test file
was run, not the full suite. All 7 tests passed in 112.936 seconds; its frame
comparison took 95.261 seconds. Median copy CPU ms/frame:

| Fixture | Isolated before | Isolated after | Loaded before | Loaded after |
| --- | ---: | ---: | ---: | ---: |
| Welder | 1.279 | 0.962 | 2.199 | 1.705 |
| Kant Twist | 3.714 | 2.357 | 6.310 | 4.095 |
| Arbor press | 1.147 | 0.794 | 1.984 | 1.407 |
| Synthetic 50/80 | 3.000 | 2.404 | 5.096 | 4.058 |

The synthetic after/before CPU ratio was 0.801 isolated and 0.796 loaded. Its
loaded copy limit was 4.577 ms/frame, so the optimized workload passed without
raising the allowance. Absolute CPU costs increased under SMT/cache contention,
but the relative copy improvement remained.

Two temporary test copies verified the distinction between waiting and work:

1. **Descheduling control:** on only the synthetic fixture, wait 10 ms inside
   the first measured optimized copy of every frame using `Atomics.wait`.
   Frame equality and the CPU guards passed. Actual optimized copy wall time
   was 16.386 ms/frame, which would fail the original 2.924 ms/frame limit;
   batched CPU time was 2.404 ms/frame against a 2.785 ms/frame CPU limit.
2. **Regression control:** inject 20 redundant `structuredClone(assembly)` calls
   into each optimized seek using an in-memory controller source modification.
   Frame equality and the total-cost guard still passed, and the copy guard
   correctly failed on Welder: 5.423 ms/frame against a 1.581 ms/frame limit.

The controls left production sources untouched and removed their temporary
test files. Local scripts and TAP evidence remain in `%TEMP%`:

- `modelforge-motion-load-probe.cjs` / `modelforge-motion-timing-loaded.tap`
- `modelforge-motion-deschedule-control.cjs` / `modelforge-motion-deschedule-control.tap`
- `modelforge-motion-regression-control.cjs` / `modelforge-motion-copy-regression-control.tap`
- `modelforge-motion-timing-before.mjs`: pre-investigation test snapshot

## Validation and reproduction

```powershell
node --test --test-timeout=600000 --test-reporter=tap tests/motion_playback_fast.test.mjs
node --test --test-timeout=600000 --test-reporter=tap tests/motion_playback.test.mjs tests/cad_motion_incremental.test.mjs tests/cad_motion_study_full_pose.test.mjs
npm run check
```

The first command passed 7/7 isolated and 7/7 with the competing workers. The
three neighboring files passed 17/17 tests. `npm run check` passed: no free
identifiers, no link errors across 751 modules, and 1,213 source assertions
checked. No full suite was run and no commit was created.
