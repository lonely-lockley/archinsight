# Linker phase timing report

Generated: 2026-11-25T06:11:39.253Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 86.4 ms (1.7% of 4953.2 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 27.2 ms.

Cold link time grows 17.4× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1503.1 ms, source classification 0.4 ms, snapshot build 1.2 ms, workspace 233.3 ms, deployment 1504.9 ms, projections 265.1 ms, completion 1354.9 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 27.1 ms, operator implementation 23.8 ms, resolution and bookkeeping 35.5 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 285.2 | 241.5 | 0.0 | 17.7 | 7.2 | 5.1 | 0.0 | 5.5 | 8.5 |
| 20 | 1 | 346.8 | 253.8 | 0.1 | 37.7 | 18.1 | 8.7 | 0.0 | 10.6 | 16.1 |
| 30 | 1 | 402.7 | 273.2 | 0.1 | 39.6 | 32.7 | 12.1 | 0.0 | 15.6 | 27.5 |
| 40 | 1 | 506.5 | 333.7 | 0.1 | 44.9 | 50.4 | 15.8 | 0.0 | 21.8 | 37.5 |
| 50 | 1 | 623.8 | 372.1 | 0.1 | 69.8 | 76.6 | 18.2 | 0.0 | 29.3 | 55.6 |
| 60 | 1 | 744.7 | 441.0 | 0.1 | 60.9 | 97.7 | 28.4 | 0.0 | 35.4 | 79.2 |
| 70 | 1 | 856.7 | 481.1 | 0.1 | 82.1 | 129.2 | 25.8 | 0.0 | 43.1 | 93.2 |
| 80 | 3 | 995.2 | 538.3 | 0.1 | 84.7 | 168.7 | 29.2 | 0.0 | 51.1 | 122.3 |
| 90 | 1 | 1157.6 | 595.5 | 0.1 | 95.9 | 213.1 | 33.5 | 0.0 | 60.5 | 156.8 |
| 100 | 1 | 1327.8 | 652.7 | 0.2 | 106.4 | 262.0 | 36.4 | 0.0 | 69.5 | 198.3 |
| 110 | 1 | 1457.1 | 693.2 | 0.2 | 106.9 | 296.0 | 39.2 | 0.0 | 78.0 | 241.5 |
| 120 | 1 | 1643.6 | 759.8 | 0.2 | 114.8 | 345.3 | 41.5 | 0.0 | 87.5 | 291.6 |
| 130 | 1 | 1838.9 | 815.5 | 0.2 | 118.5 | 405.8 | 45.1 | 0.0 | 97.5 | 353.2 |
| 140 | 3 | 1962.6 | 879.2 | 0.2 | 122.6 | 465.0 | 49.3 | 0.0 | 109.2 | 332.9 |
| 150 | 1 | 2196.3 | 909.6 | 0.2 | 153.2 | 566.8 | 51.9 | 0.0 | 121.1 | 390.8 |
| 160 | 1 | 2416.1 | 1000.9 | 0.3 | 145.1 | 616.7 | 56.3 | 0.0 | 131.5 | 462.5 |
| 170 | 1 | 2636.8 | 1027.6 | 0.2 | 154.8 | 703.4 | 62.1 | 0.0 | 145.2 | 540.7 |
| 180 | 3 | 2905.3 | 1107.2 | 0.3 | 159.0 | 780.2 | 61.0 | 0.0 | 159.0 | 618.8 |
| 190 | 1 | 3157.4 | 1189.4 | 0.4 | 167.5 | 878.8 | 63.6 | 0.0 | 166.0 | 684.7 |
| 200 | 1 | 3385.7 | 1174.1 | 0.3 | 175.8 | 979.2 | 83.6 | 0.0 | 186.8 | 782.9 |
| 210 | 3 | 3658.3 | 1263.8 | 0.3 | 184.0 | 1059.4 | 84.6 | 0.0 | 198.0 | 878.2 |
| 220 | 3 | 3975.6 | 1298.3 | 0.4 | 200.9 | 1181.4 | 75.4 | 0.0 | 213.7 | 997.5 |
| 230 | 1 | 4235.2 | 1380.4 | 0.4 | 197.7 | 1276.0 | 78.4 | 0.0 | 228.6 | 1070.6 |
| 240 | 1 | 4555.1 | 1436.4 | 0.4 | 224.7 | 1380.0 | 81.7 | 0.0 | 240.7 | 1188.1 |
| 250 | 3 | 4953.2 | 1503.1 | 0.4 | 233.3 | 1504.9 | 86.4 | 0.0 | 265.1 | 1354.9 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
