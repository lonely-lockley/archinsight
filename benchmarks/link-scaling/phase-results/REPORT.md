# Linker phase timing report

Generated: 2026-11-24T19:34:43.409Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 82.6 ms (1.7% of 4852.0 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 27.1 ms.

Cold link time grows 17.1× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1464.9 ms, source classification 0.4 ms, snapshot build 1.2 ms, workspace 234.9 ms, deployment 1473.9 ms, projections 261.4 ms, completion 1330.8 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 25.4 ms, operator implementation 23.8 ms, resolution and bookkeeping 33.4 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 284.5 | 239.6 | 0.0 | 17.2 | 7.3 | 5.1 | 0.0 | 5.5 | 8.4 |
| 20 | 1 | 338.9 | 245.4 | 0.1 | 37.8 | 18.0 | 8.8 | 0.0 | 10.8 | 16.1 |
| 30 | 1 | 396.6 | 269.3 | 0.1 | 37.9 | 32.7 | 11.7 | 0.0 | 15.6 | 27.3 |
| 40 | 1 | 509.2 | 341.1 | 0.1 | 41.6 | 49.9 | 15.5 | 0.0 | 22.3 | 36.7 |
| 50 | 1 | 599.9 | 367.5 | 0.1 | 50.1 | 73.4 | 22.2 | 0.0 | 29.1 | 55.6 |
| 60 | 1 | 723.6 | 418.0 | 0.1 | 64.9 | 100.2 | 22.2 | 0.0 | 36.3 | 79.8 |
| 70 | 1 | 846.0 | 471.2 | 0.1 | 83.4 | 128.9 | 26.3 | 0.0 | 42.7 | 91.4 |
| 80 | 3 | 992.1 | 535.3 | 0.1 | 85.1 | 169.3 | 29.5 | 0.0 | 51.3 | 119.7 |
| 90 | 1 | 1148.0 | 585.0 | 0.2 | 89.7 | 214.1 | 37.2 | 0.0 | 62.7 | 156.9 |
| 100 | 1 | 1331.9 | 662.0 | 0.2 | 104.1 | 258.1 | 35.9 | 0.0 | 69.8 | 199.6 |
| 110 | 1 | 1483.8 | 712.5 | 0.2 | 112.9 | 296.5 | 39.5 | 0.0 | 77.4 | 242.5 |
| 120 | 1 | 1642.8 | 748.2 | 0.2 | 112.9 | 348.5 | 45.5 | 0.0 | 91.8 | 293.6 |
| 130 | 1 | 1854.6 | 810.8 | 0.2 | 125.6 | 413.4 | 46.6 | 0.0 | 98.5 | 356.9 |
| 140 | 3 | 1955.4 | 868.9 | 0.3 | 122.7 | 466.3 | 49.8 | 0.0 | 108.5 | 336.9 |
| 150 | 1 | 2138.2 | 909.4 | 0.3 | 128.9 | 530.9 | 51.7 | 0.0 | 120.1 | 394.4 |
| 160 | 1 | 2372.3 | 962.0 | 0.3 | 140.2 | 614.2 | 54.4 | 0.0 | 130.4 | 468.0 |
| 170 | 1 | 2624.1 | 1050.0 | 0.3 | 150.6 | 696.0 | 56.9 | 0.0 | 141.9 | 525.7 |
| 180 | 3 | 2811.6 | 1066.4 | 0.3 | 157.7 | 768.7 | 60.6 | 0.0 | 155.9 | 607.4 |
| 190 | 1 | 3040.4 | 1104.0 | 0.3 | 162.4 | 857.1 | 62.0 | 0.0 | 168.3 | 679.5 |
| 200 | 1 | 3351.7 | 1155.8 | 0.3 | 175.1 | 970.8 | 82.2 | 0.0 | 186.6 | 778.0 |
| 210 | 3 | 3605.8 | 1225.2 | 0.3 | 183.3 | 1050.2 | 72.4 | 0.0 | 199.4 | 866.8 |
| 220 | 3 | 3930.3 | 1289.6 | 0.4 | 199.9 | 1156.4 | 73.2 | 0.0 | 213.7 | 984.3 |
| 230 | 1 | 4246.7 | 1360.6 | 0.4 | 215.8 | 1263.6 | 78.5 | 0.0 | 227.4 | 1097.1 |
| 240 | 1 | 4596.2 | 1415.6 | 0.4 | 233.4 | 1374.8 | 82.0 | 0.0 | 250.1 | 1236.7 |
| 250 | 3 | 4852.0 | 1464.9 | 0.4 | 234.9 | 1473.9 | 82.6 | 0.0 | 261.4 | 1330.8 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
