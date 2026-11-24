# Linker phase timing report

Generated: 2026-11-24T13:02:50.969Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 93.1 ms (1.9% of 4927.6 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 24.8 ms.

Cold link time grows 17.3× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1482.6 ms, source classification 0.4 ms, snapshot build 1.2 ms, workspace 231.1 ms, deployment 1503.6 ms, projections 259.7 ms, completion 1361.5 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 29.5 ms, operator implementation 24.3 ms, resolution and bookkeeping 39.3 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 285.3 | 241.5 | 0.0 | 16.6 | 7.2 | 5.0 | 0.0 | 5.3 | 7.8 |
| 20 | 1 | 336.2 | 245.9 | 0.1 | 37.3 | 17.9 | 8.6 | 0.0 | 9.9 | 14.9 |
| 30 | 1 | 399.8 | 273.7 | 0.1 | 38.6 | 32.6 | 11.8 | 0.0 | 15.1 | 26.0 |
| 40 | 1 | 507.6 | 339.5 | 0.1 | 42.6 | 49.8 | 15.6 | 0.0 | 21.1 | 37.1 |
| 50 | 1 | 630.6 | 383.0 | 0.1 | 65.4 | 75.6 | 19.5 | 0.0 | 28.7 | 56.3 |
| 60 | 1 | 737.0 | 426.1 | 0.1 | 74.6 | 97.1 | 22.0 | 0.0 | 34.9 | 80.2 |
| 70 | 1 | 848.6 | 478.6 | 0.1 | 72.7 | 128.7 | 31.7 | 0.0 | 41.9 | 92.7 |
| 80 | 3 | 1011.2 | 548.9 | 0.1 | 91.2 | 168.4 | 29.4 | 0.0 | 50.0 | 121.1 |
| 90 | 1 | 1151.2 | 589.6 | 0.2 | 98.0 | 214.0 | 33.6 | 0.0 | 59.9 | 153.7 |
| 100 | 1 | 1315.1 | 653.2 | 0.2 | 106.9 | 257.9 | 36.1 | 0.0 | 66.0 | 192.5 |
| 110 | 1 | 1476.3 | 699.5 | 0.2 | 108.6 | 307.2 | 38.2 | 0.0 | 75.1 | 245.1 |
| 120 | 1 | 1655.3 | 774.5 | 0.2 | 113.5 | 345.1 | 41.4 | 0.0 | 85.3 | 293.0 |
| 130 | 1 | 1835.8 | 818.6 | 0.2 | 119.3 | 404.6 | 44.2 | 0.0 | 92.9 | 353.0 |
| 140 | 3 | 1967.9 | 863.6 | 0.2 | 134.8 | 478.9 | 49.0 | 0.0 | 107.1 | 347.4 |
| 150 | 1 | 2180.3 | 927.2 | 0.3 | 131.4 | 541.8 | 52.6 | 0.0 | 119.9 | 404.5 |
| 160 | 1 | 2453.2 | 989.5 | 0.2 | 157.7 | 646.4 | 57.1 | 0.0 | 130.4 | 469.1 |
| 170 | 1 | 2653.0 | 1035.8 | 0.2 | 168.8 | 707.7 | 58.8 | 0.0 | 143.5 | 535.5 |
| 180 | 3 | 2870.1 | 1093.2 | 0.2 | 166.2 | 791.7 | 62.0 | 0.0 | 154.9 | 606.2 |
| 190 | 1 | 3094.3 | 1149.4 | 0.3 | 167.6 | 865.0 | 63.7 | 0.0 | 168.3 | 677.1 |
| 200 | 1 | 3382.0 | 1199.0 | 0.3 | 184.9 | 964.7 | 69.3 | 0.0 | 183.2 | 777.8 |
| 210 | 3 | 3633.9 | 1256.3 | 0.3 | 181.4 | 1047.3 | 72.6 | 0.0 | 194.2 | 876.4 |
| 220 | 3 | 3940.8 | 1324.1 | 0.4 | 198.3 | 1154.1 | 75.7 | 0.0 | 211.5 | 1005.9 |
| 230 | 1 | 4273.3 | 1379.2 | 0.3 | 194.2 | 1262.2 | 77.5 | 0.0 | 225.7 | 1131.0 |
| 240 | 1 | 4644.6 | 1414.3 | 0.3 | 225.1 | 1394.0 | 80.3 | 0.0 | 242.1 | 1285.2 |
| 250 | 3 | 4927.6 | 1482.6 | 0.4 | 231.1 | 1503.6 | 93.1 | 0.0 | 259.7 | 1361.5 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
