# Linker phase timing report

Generated: 2026-11-26T07:57:27.296Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 82.9 ms (2.8% of 2971.2 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 36.7 ms.

Cold link time grows 9.2× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1934.2 ms, source classification 0.5 ms, snapshot build 1.6 ms, workspace 231.4 ms, deployment 53.0 ms, projections 559.0 ms, completion 86.8 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 24.9 ms, operator implementation 22.7 ms, resolution and bookkeeping 35.4 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 322.6 | 277.6 | 0.0 | 18.6 | 3.3 | 5.0 | 0.0 | 10.1 | 6.1 |
| 20 | 1 | 379.9 | 297.1 | 0.1 | 35.7 | 5.8 | 8.7 | 0.0 | 20.2 | 9.3 |
| 30 | 1 | 434.1 | 327.6 | 0.1 | 39.2 | 8.4 | 11.8 | 0.0 | 32.3 | 12.5 |
| 40 | 1 | 535.8 | 396.7 | 0.1 | 49.8 | 11.2 | 15.8 | 0.0 | 44.9 | 15.3 |
| 50 | 1 | 635.3 | 465.6 | 0.1 | 53.6 | 14.4 | 22.7 | 0.0 | 57.6 | 19.0 |
| 60 | 1 | 750.8 | 547.3 | 0.1 | 71.3 | 14.5 | 21.7 | 0.0 | 72.0 | 21.6 |
| 70 | 1 | 869.5 | 624.9 | 0.1 | 89.6 | 16.9 | 25.4 | 0.0 | 85.7 | 24.6 |
| 80 | 3 | 970.9 | 691.3 | 0.1 | 90.5 | 19.3 | 28.4 | 0.0 | 103.5 | 28.1 |
| 90 | 1 | 1080.4 | 760.3 | 0.1 | 108.6 | 21.5 | 31.3 | 0.0 | 120.2 | 31.3 |
| 100 | 1 | 1181.4 | 828.7 | 0.1 | 117.5 | 23.1 | 35.5 | 0.0 | 138.4 | 35.7 |
| 110 | 1 | 1284.7 | 905.5 | 0.2 | 113.3 | 25.6 | 37.5 | 0.0 | 160.4 | 39.5 |
| 120 | 1 | 1403.7 | 984.0 | 0.2 | 115.8 | 27.5 | 48.7 | 0.0 | 184.0 | 41.0 |
| 130 | 1 | 1495.6 | 1042.3 | 0.2 | 125.8 | 30.8 | 45.6 | 0.0 | 203.2 | 44.5 |
| 140 | 3 | 1651.7 | 1159.9 | 0.2 | 127.4 | 32.8 | 48.8 | 0.0 | 226.9 | 48.4 |
| 150 | 1 | 1759.3 | 1229.4 | 0.2 | 142.8 | 33.9 | 51.7 | 0.0 | 247.7 | 50.8 |
| 160 | 1 | 1864.6 | 1295.0 | 0.2 | 146.8 | 35.7 | 53.9 | 0.0 | 275.4 | 54.6 |
| 170 | 1 | 1951.8 | 1334.2 | 0.3 | 160.3 | 37.9 | 56.8 | 0.0 | 300.8 | 58.6 |
| 180 | 3 | 2089.8 | 1429.5 | 0.3 | 166.0 | 39.6 | 60.7 | 0.0 | 331.2 | 61.1 |
| 190 | 1 | 2171.3 | 1462.8 | 0.3 | 175.9 | 41.9 | 63.4 | 0.0 | 357.9 | 66.1 |
| 200 | 1 | 2335.5 | 1584.7 | 0.3 | 179.1 | 43.3 | 66.2 | 0.0 | 388.3 | 70.4 |
| 210 | 3 | 2462.1 | 1633.4 | 0.3 | 188.2 | 46.4 | 71.3 | 0.0 | 423.5 | 75.5 |
| 220 | 3 | 2607.7 | 1738.1 | 0.3 | 199.6 | 47.4 | 74.2 | 0.0 | 467.6 | 80.7 |
| 230 | 1 | 2736.1 | 1798.4 | 0.4 | 229.4 | 51.6 | 78.4 | 0.0 | 491.9 | 82.5 |
| 240 | 1 | 2845.0 | 1881.0 | 0.4 | 223.0 | 51.1 | 78.8 | 0.0 | 519.3 | 87.1 |
| 250 | 3 | 2971.2 | 1934.2 | 0.5 | 231.4 | 53.0 | 82.9 | 0.0 | 559.0 | 86.8 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
