# Linker phase timing report

Generated: 2026-11-24T20:16:56.284Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 84.7 ms (1.7% of 4884.0 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 25.1 ms.

Cold link time grows 17.1× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1470.2 ms, source classification 0.4 ms, snapshot build 1.2 ms, workspace 227.5 ms, deployment 1493.2 ms, projections 261.7 ms, completion 1340.0 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 27.2 ms, operator implementation 23.2 ms, resolution and bookkeeping 34.3 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 285.5 | 239.9 | 0.0 | 17.3 | 7.3 | 5.1 | 0.0 | 5.6 | 8.5 |
| 20 | 1 | 336.9 | 246.0 | 0.1 | 36.8 | 18.0 | 8.8 | 0.0 | 10.4 | 15.1 |
| 30 | 1 | 392.6 | 264.1 | 0.1 | 38.3 | 33.0 | 12.2 | 0.0 | 16.0 | 27.1 |
| 40 | 1 | 509.8 | 334.8 | 0.1 | 47.8 | 51.0 | 15.6 | 0.0 | 21.1 | 37.3 |
| 50 | 1 | 613.5 | 367.7 | 0.1 | 68.0 | 74.8 | 18.8 | 0.0 | 28.4 | 53.7 |
| 60 | 1 | 721.7 | 415.6 | 0.1 | 65.2 | 100.1 | 22.3 | 0.0 | 35.5 | 80.7 |
| 70 | 1 | 845.3 | 474.0 | 0.1 | 79.4 | 128.3 | 26.7 | 0.0 | 42.4 | 92.3 |
| 80 | 3 | 999.4 | 536.4 | 0.1 | 94.2 | 170.0 | 28.3 | 0.0 | 51.5 | 120.5 |
| 90 | 1 | 1151.3 | 592.8 | 0.2 | 98.9 | 212.3 | 32.1 | 0.0 | 59.6 | 153.2 |
| 100 | 1 | 1288.2 | 631.8 | 0.2 | 101.8 | 256.5 | 35.2 | 0.0 | 66.8 | 193.7 |
| 110 | 1 | 1458.6 | 701.9 | 0.2 | 104.7 | 292.7 | 38.6 | 0.0 | 77.5 | 240.7 |
| 120 | 1 | 1658.1 | 744.8 | 0.2 | 121.5 | 359.6 | 43.5 | 0.0 | 87.9 | 298.2 |
| 130 | 1 | 1839.6 | 821.0 | 0.2 | 122.3 | 404.7 | 45.5 | 0.0 | 96.7 | 346.2 |
| 140 | 3 | 1952.3 | 858.2 | 0.2 | 121.2 | 471.1 | 47.8 | 0.0 | 107.3 | 339.1 |
| 150 | 1 | 2151.9 | 904.3 | 0.2 | 140.9 | 530.8 | 51.5 | 0.0 | 120.0 | 401.7 |
| 160 | 1 | 2394.9 | 970.5 | 0.2 | 154.2 | 622.6 | 55.4 | 0.0 | 130.7 | 458.6 |
| 170 | 1 | 2600.6 | 1002.4 | 0.2 | 159.7 | 704.9 | 57.6 | 0.0 | 143.2 | 529.9 |
| 180 | 3 | 2805.4 | 1061.3 | 0.3 | 157.8 | 772.5 | 61.0 | 0.0 | 158.0 | 592.7 |
| 190 | 1 | 3083.2 | 1137.2 | 0.3 | 165.9 | 854.8 | 63.4 | 0.0 | 167.9 | 686.1 |
| 200 | 1 | 3320.4 | 1163.6 | 0.3 | 171.6 | 953.0 | 67.3 | 0.0 | 194.8 | 766.8 |
| 210 | 3 | 3645.3 | 1255.6 | 0.3 | 180.9 | 1049.8 | 70.6 | 0.0 | 198.5 | 872.1 |
| 220 | 3 | 3952.8 | 1296.9 | 0.3 | 200.1 | 1168.5 | 76.5 | 0.0 | 216.0 | 991.4 |
| 230 | 1 | 4207.5 | 1330.3 | 0.4 | 214.6 | 1274.9 | 77.4 | 0.0 | 228.7 | 1077.9 |
| 240 | 1 | 4551.4 | 1398.5 | 0.4 | 204.2 | 1375.6 | 81.4 | 0.0 | 265.0 | 1223.0 |
| 250 | 3 | 4884.0 | 1470.2 | 0.4 | 227.5 | 1493.2 | 84.7 | 0.0 | 261.7 | 1340.0 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
