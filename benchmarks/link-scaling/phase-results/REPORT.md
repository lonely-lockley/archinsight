# Linker phase timing report

Generated: 2026-11-22T11:37:41.071Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 83.2 ms (1.7% of 4843.9 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 24.7 ms.

Cold link time grows 17.4× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1409.0 ms, source classification 0.4 ms, snapshot build 1.2 ms, workspace 233.5 ms, deployment 1495.7 ms, projections 259.9 ms, completion 1339.5 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 26.4 ms, operator implementation 22.7 ms, resolution and bookkeeping 34.2 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 279.1 | 234.9 | 0.0 | 16.8 | 7.3 | 4.9 | 0.0 | 5.3 | 8.3 |
| 20 | 1 | 335.1 | 244.1 | 0.1 | 36.7 | 17.9 | 8.6 | 0.0 | 10.5 | 15.5 |
| 30 | 1 | 393.0 | 261.6 | 0.1 | 41.8 | 32.8 | 12.3 | 0.0 | 16.6 | 25.9 |
| 40 | 1 | 501.3 | 332.0 | 0.1 | 42.6 | 49.1 | 15.1 | 0.0 | 23.0 | 37.4 |
| 50 | 1 | 607.6 | 363.5 | 0.1 | 65.1 | 75.9 | 18.7 | 0.0 | 27.2 | 55.4 |
| 60 | 1 | 741.5 | 419.2 | 0.1 | 79.9 | 102.1 | 23.4 | 0.0 | 35.5 | 79.0 |
| 70 | 1 | 845.2 | 479.8 | 0.1 | 73.5 | 124.0 | 31.1 | 0.0 | 41.7 | 93.1 |
| 80 | 3 | 983.5 | 527.6 | 0.1 | 90.6 | 167.4 | 28.5 | 0.0 | 50.2 | 119.5 |
| 90 | 1 | 1150.0 | 589.6 | 0.1 | 95.4 | 214.4 | 32.4 | 0.0 | 59.4 | 156.4 |
| 100 | 1 | 1283.1 | 623.8 | 0.2 | 105.7 | 256.6 | 35.8 | 0.0 | 67.4 | 191.7 |
| 110 | 1 | 1451.3 | 668.1 | 0.2 | 109.4 | 312.5 | 38.8 | 0.0 | 76.7 | 237.9 |
| 120 | 1 | 1601.4 | 720.5 | 0.2 | 112.1 | 343.9 | 41.3 | 0.0 | 88.0 | 293.3 |
| 130 | 1 | 1793.4 | 785.4 | 0.2 | 116.9 | 403.0 | 44.6 | 0.0 | 93.8 | 347.0 |
| 140 | 3 | 1936.5 | 833.9 | 0.2 | 130.1 | 473.6 | 47.6 | 0.0 | 107.1 | 346.0 |
| 150 | 1 | 2146.0 | 911.2 | 0.2 | 129.1 | 535.4 | 51.6 | 0.0 | 117.9 | 398.3 |
| 160 | 1 | 2364.2 | 947.3 | 0.2 | 149.9 | 625.9 | 54.4 | 0.0 | 129.4 | 454.8 |
| 170 | 1 | 2588.1 | 997.2 | 0.2 | 156.3 | 710.7 | 56.4 | 0.0 | 139.6 | 525.3 |
| 180 | 3 | 2798.3 | 1048.1 | 0.3 | 153.8 | 772.3 | 61.4 | 0.0 | 154.2 | 608.7 |
| 190 | 1 | 3019.7 | 1087.7 | 0.3 | 159.2 | 862.2 | 61.8 | 0.0 | 165.7 | 675.7 |
| 200 | 1 | 3299.7 | 1163.0 | 0.3 | 170.5 | 953.7 | 65.0 | 0.0 | 181.0 | 763.6 |
| 210 | 3 | 3602.4 | 1198.9 | 0.3 | 182.1 | 1058.9 | 70.1 | 0.0 | 196.3 | 893.5 |
| 220 | 3 | 3875.9 | 1265.4 | 0.3 | 192.1 | 1158.8 | 73.0 | 0.0 | 210.8 | 970.6 |
| 230 | 1 | 4191.1 | 1308.1 | 0.4 | 213.3 | 1281.7 | 76.0 | 0.0 | 224.7 | 1084.4 |
| 240 | 1 | 4477.7 | 1354.0 | 0.3 | 209.6 | 1385.9 | 78.8 | 0.0 | 240.9 | 1205.6 |
| 250 | 3 | 4843.9 | 1409.0 | 0.4 | 233.5 | 1495.7 | 83.2 | 0.0 | 259.9 | 1339.5 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
