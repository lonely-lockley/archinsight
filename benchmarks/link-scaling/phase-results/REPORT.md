# Linker phase timing report

Generated: 2026-11-26T06:58:08.788Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 83.4 ms (2.8% of 2946.0 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 37.1 ms.

Cold link time grows 9.0× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1917.7 ms, source classification 0.4 ms, snapshot build 1.2 ms, workspace 239.0 ms, deployment 53.5 ms, projections 559.0 ms, completion 88.5 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 25.8 ms, operator implementation 22.2 ms, resolution and bookkeeping 35.4 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 327.3 | 280.9 | 0.0 | 18.3 | 3.4 | 5.1 | 0.0 | 10.0 | 7.6 |
| 20 | 1 | 382.9 | 302.1 | 0.1 | 36.1 | 5.6 | 8.4 | 0.0 | 19.5 | 9.3 |
| 30 | 1 | 435.3 | 327.7 | 0.1 | 39.0 | 8.6 | 12.8 | 0.0 | 32.0 | 13.0 |
| 40 | 1 | 547.4 | 399.2 | 0.1 | 60.4 | 10.3 | 15.9 | 0.0 | 43.7 | 15.8 |
| 50 | 1 | 634.0 | 464.3 | 0.1 | 53.9 | 14.1 | 22.5 | 0.0 | 57.8 | 19.2 |
| 60 | 1 | 742.0 | 543.3 | 0.1 | 67.0 | 15.0 | 21.8 | 0.0 | 70.9 | 21.7 |
| 70 | 1 | 871.7 | 624.1 | 0.1 | 92.7 | 17.9 | 25.1 | 0.0 | 85.0 | 24.4 |
| 80 | 3 | 962.5 | 683.5 | 0.1 | 98.8 | 19.7 | 28.2 | 0.0 | 102.4 | 27.2 |
| 90 | 1 | 1067.2 | 763.8 | 0.2 | 97.5 | 21.0 | 31.3 | 0.0 | 120.1 | 30.7 |
| 100 | 1 | 1183.0 | 832.4 | 0.2 | 112.4 | 23.8 | 35.5 | 0.0 | 140.3 | 35.8 |
| 110 | 1 | 1281.2 | 899.8 | 0.2 | 116.5 | 25.2 | 38.4 | 0.0 | 161.2 | 37.4 |
| 120 | 1 | 1375.3 | 953.3 | 0.2 | 119.4 | 27.5 | 48.5 | 0.0 | 181.8 | 42.2 |
| 130 | 1 | 1521.3 | 1059.6 | 0.2 | 132.2 | 31.4 | 45.8 | 0.0 | 203.4 | 45.9 |
| 140 | 3 | 1609.3 | 1126.8 | 0.2 | 125.2 | 32.1 | 47.3 | 0.0 | 224.0 | 47.9 |
| 150 | 1 | 1730.2 | 1196.6 | 0.2 | 142.2 | 34.1 | 51.7 | 0.0 | 251.6 | 50.9 |
| 160 | 1 | 1866.8 | 1295.4 | 0.3 | 145.9 | 37.3 | 55.6 | 0.0 | 275.1 | 54.3 |
| 170 | 1 | 1998.7 | 1362.6 | 0.2 | 169.2 | 39.3 | 58.1 | 0.0 | 304.3 | 62.0 |
| 180 | 3 | 2087.3 | 1431.9 | 0.3 | 163.4 | 39.9 | 59.7 | 0.0 | 329.2 | 61.7 |
| 190 | 1 | 2158.2 | 1458.5 | 0.3 | 168.5 | 41.3 | 63.5 | 0.0 | 356.7 | 66.4 |
| 200 | 1 | 2327.0 | 1549.7 | 0.3 | 195.5 | 43.9 | 68.3 | 0.0 | 394.3 | 71.7 |
| 210 | 3 | 2451.1 | 1624.2 | 0.4 | 195.4 | 45.9 | 72.3 | 0.0 | 422.7 | 73.6 |
| 220 | 3 | 2572.4 | 1705.4 | 0.3 | 210.5 | 47.9 | 74.0 | 0.0 | 450.6 | 79.2 |
| 230 | 1 | 2703.4 | 1767.4 | 0.4 | 227.6 | 51.1 | 78.0 | 0.0 | 489.4 | 86.0 |
| 240 | 1 | 2879.9 | 1933.5 | 0.4 | 207.0 | 50.4 | 78.9 | 0.0 | 521.3 | 84.8 |
| 250 | 3 | 2946.0 | 1917.7 | 0.4 | 239.0 | 53.5 | 83.4 | 0.0 | 559.0 | 88.5 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
