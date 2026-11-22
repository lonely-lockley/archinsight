# Linker phase timing report

Generated: 2026-11-22T11:07:25.086Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 84.7 ms (0.9% of 9849.6 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 29.0 ms.

Cold link time grows 25.5× while service count grows 25×. The other top-level phases at full scale are: source classification 3191.1 ms, snapshot build 1.3 ms, workspace 3498.5 ms, deployment 1499.1 ms, projections 257.7 ms, completion 1317.1 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 25.9 ms, operator implementation 23.8 ms, resolution and bookkeeping 34.9 ms.

## Measurements

| Services | Trials | Total ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 387.0 | 186.3 | 173.0 | 7.4 | 5.2 | 0.0 | 5.1 | 7.9 |
| 20 | 1 | 660.1 | 304.6 | 302.3 | 17.9 | 8.6 | 0.0 | 9.6 | 15.6 |
| 30 | 1 | 955.4 | 429.0 | 438.4 | 31.4 | 13.5 | 0.0 | 14.9 | 26.6 |
| 40 | 1 | 1245.6 | 552.6 | 567.7 | 49.6 | 15.7 | 0.0 | 21.9 | 36.5 |
| 50 | 1 | 1564.7 | 675.8 | 703.8 | 75.0 | 21.9 | 0.0 | 28.7 | 57.8 |
| 60 | 1 | 1896.0 | 811.7 | 842.4 | 98.3 | 30.0 | 0.0 | 34.3 | 77.6 |
| 70 | 1 | 2208.6 | 917.9 | 1002.2 | 130.4 | 26.0 | 0.0 | 42.6 | 87.7 |
| 80 | 3 | 2572.2 | 1069.3 | 1134.1 | 168.6 | 29.7 | 0.0 | 49.8 | 118.2 |
| 90 | 1 | 2839.4 | 1162.9 | 1230.8 | 202.4 | 32.2 | 0.0 | 57.5 | 151.9 |
| 100 | 1 | 3248.4 | 1288.2 | 1401.2 | 251.8 | 48.2 | 0.0 | 66.5 | 190.8 |
| 110 | 1 | 3594.2 | 1414.7 | 1526.3 | 301.3 | 37.8 | 0.0 | 74.1 | 238.2 |
| 120 | 1 | 3973.2 | 1538.6 | 1660.0 | 352.2 | 41.8 | 0.0 | 86.4 | 292.4 |
| 130 | 1 | 4344.8 | 1663.6 | 1783.7 | 412.1 | 44.8 | 0.0 | 94.6 | 344.1 |
| 140 | 3 | 4728.9 | 1818.0 | 1946.5 | 480.7 | 48.0 | 0.0 | 106.7 | 328.2 |
| 150 | 1 | 5056.3 | 1914.5 | 2059.0 | 521.7 | 52.8 | 0.0 | 115.6 | 390.8 |
| 160 | 1 | 5587.5 | 2045.6 | 2260.5 | 634.4 | 58.9 | 0.0 | 132.2 | 453.9 |
| 170 | 1 | 5937.4 | 2167.6 | 2349.1 | 685.6 | 59.9 | 0.0 | 139.8 | 533.3 |
| 180 | 3 | 6517.2 | 2368.7 | 2532.5 | 788.9 | 61.1 | 0.0 | 152.6 | 592.6 |
| 190 | 1 | 6747.5 | 2396.5 | 2582.1 | 855.1 | 65.0 | 0.0 | 168.4 | 678.2 |
| 200 | 1 | 7260.7 | 2532.8 | 2759.2 | 961.8 | 68.1 | 0.0 | 180.8 | 755.9 |
| 210 | 3 | 7828.5 | 2710.1 | 2896.2 | 1072.8 | 73.5 | 0.0 | 196.0 | 854.7 |
| 220 | 3 | 8276.3 | 2841.4 | 3042.3 | 1158.3 | 97.4 | 0.0 | 209.1 | 960.3 |
| 230 | 1 | 8692.6 | 2902.5 | 3168.2 | 1280.5 | 77.5 | 0.0 | 222.6 | 1039.2 |
| 240 | 1 | 9283.3 | 3086.0 | 3332.4 | 1374.8 | 79.2 | 0.0 | 243.8 | 1164.9 |
| 250 | 3 | 9849.6 | 3191.1 | 3498.5 | 1499.1 | 84.7 | 0.0 | 257.7 | 1317.1 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
