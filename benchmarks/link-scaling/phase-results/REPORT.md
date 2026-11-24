# Linker phase timing report

Generated: 2026-11-22T16:11:48.035Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 83.2 ms (1.7% of 4830.6 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 24.7 ms.

Cold link time grows 17.2× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1429.9 ms, source classification 0.4 ms, snapshot build 1.2 ms, workspace 222.0 ms, deployment 1503.1 ms, projections 259.7 ms, completion 1345.5 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 25.6 ms, operator implementation 22.8 ms, resolution and bookkeeping 34.8 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 281.3 | 236.6 | 0.0 | 16.8 | 7.3 | 5.0 | 0.0 | 5.4 | 8.4 |
| 20 | 1 | 333.5 | 243.3 | 0.1 | 35.6 | 18.0 | 8.8 | 0.0 | 10.3 | 15.6 |
| 30 | 1 | 390.4 | 265.0 | 0.1 | 37.0 | 33.0 | 12.4 | 0.0 | 15.5 | 25.6 |
| 40 | 1 | 519.3 | 328.3 | 0.1 | 61.4 | 52.7 | 14.8 | 0.0 | 21.9 | 38.1 |
| 50 | 1 | 598.5 | 365.1 | 0.1 | 50.3 | 73.6 | 17.9 | 0.0 | 32.3 | 57.3 |
| 60 | 1 | 713.8 | 412.4 | 0.1 | 64.1 | 99.4 | 22.4 | 0.0 | 34.8 | 78.7 |
| 70 | 1 | 846.4 | 472.0 | 0.1 | 81.8 | 130.3 | 26.0 | 0.0 | 41.9 | 92.1 |
| 80 | 3 | 989.7 | 532.7 | 0.1 | 90.7 | 167.1 | 28.8 | 0.0 | 50.2 | 117.7 |
| 90 | 1 | 1138.3 | 577.1 | 0.1 | 104.3 | 211.1 | 31.0 | 0.0 | 57.9 | 154.6 |
| 100 | 1 | 1310.0 | 633.7 | 0.1 | 115.2 | 258.1 | 38.1 | 0.0 | 66.1 | 196.4 |
| 110 | 1 | 1473.7 | 695.5 | 0.2 | 112.5 | 307.9 | 38.7 | 0.0 | 74.8 | 241.8 |
| 120 | 1 | 1644.4 | 753.4 | 0.2 | 114.0 | 350.8 | 42.7 | 0.0 | 86.9 | 293.7 |
| 130 | 1 | 1804.6 | 783.5 | 0.2 | 115.8 | 411.8 | 44.5 | 0.0 | 94.6 | 351.2 |
| 140 | 3 | 1936.8 | 841.7 | 0.3 | 119.0 | 461.9 | 47.3 | 0.0 | 104.6 | 337.3 |
| 150 | 1 | 2174.5 | 891.7 | 0.2 | 149.6 | 557.8 | 51.5 | 0.0 | 117.5 | 403.4 |
| 160 | 1 | 2359.1 | 973.3 | 0.3 | 137.7 | 602.1 | 52.7 | 0.0 | 128.1 | 462.4 |
| 170 | 1 | 2563.2 | 1004.7 | 0.3 | 143.4 | 692.7 | 57.2 | 0.0 | 140.0 | 522.1 |
| 180 | 3 | 2792.3 | 1065.7 | 0.3 | 156.0 | 776.6 | 61.1 | 0.0 | 155.1 | 602.7 |
| 190 | 1 | 3031.9 | 1105.0 | 0.3 | 163.2 | 845.3 | 63.5 | 0.0 | 167.2 | 679.8 |
| 200 | 1 | 3300.5 | 1151.1 | 0.3 | 169.7 | 967.5 | 64.9 | 0.0 | 183.0 | 761.1 |
| 210 | 3 | 3590.5 | 1217.0 | 0.3 | 181.9 | 1055.6 | 69.2 | 0.0 | 195.3 | 870.7 |
| 220 | 3 | 3896.7 | 1290.0 | 0.3 | 182.8 | 1150.4 | 72.5 | 0.0 | 214.2 | 981.7 |
| 230 | 1 | 4254.8 | 1352.3 | 0.4 | 208.7 | 1272.2 | 75.9 | 0.0 | 225.1 | 1117.1 |
| 240 | 1 | 4462.6 | 1379.7 | 0.4 | 211.4 | 1354.7 | 79.7 | 0.0 | 237.9 | 1195.4 |
| 250 | 3 | 4830.6 | 1429.9 | 0.4 | 222.0 | 1503.1 | 83.2 | 0.0 | 259.7 | 1345.5 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
