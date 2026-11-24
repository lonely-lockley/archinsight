# Linker phase timing report

Generated: 2026-11-24T14:02:53.884Z. Fresh Node.js process per trial; source reads and module loading excluded; profiler is synchronous and opt-in.

Parse mode: parallel, up to 4 workers.

Every +10 service point has one phase-profiled run. Control points 10, 80, 140, 180, 210, 220, 250 have three runs and report medians.

![Linker phase timings](phase-timings.svg)

![Secondary linker phase timings](secondary-phase-timings.svg)

## Finding

At 250 services, logical relationship materialization consumes 84.9 ms (1.7% of 4896.4 ms total). No operator implementation graph is built inside the relationship loop. The indexed graph is built once during completion in 25.0 ms.

Cold link time grows 17.1× while service count grows 25×. The other top-level phases at full scale are: parallel parsing 1470.7 ms, source classification 0.4 ms, snapshot build 1.2 ms, workspace 236.7 ms, deployment 1478.9 ms, projections 259.9 ms, completion 1341.2 ms.

Inside logical relationship materialization, the remaining measured work is: endpoint snapshots 26.4 ms, operator implementation 24.2 ms, resolution and bookkeeping 34.2 ms.

## Measurements

| Services | Trials | Total ms | Parse ms | Classify ms | Workspace ms | Deployment ms | Logical ms | Rebuild graph ms | Projection ms | Complete ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 3 | 285.7 | 240.5 | 0.0 | 17.1 | 7.3 | 5.0 | 0.0 | 5.3 | 8.4 |
| 20 | 1 | 335.2 | 245.8 | 0.1 | 36.0 | 17.7 | 8.4 | 0.0 | 10.0 | 15.6 |
| 30 | 1 | 394.7 | 268.3 | 0.1 | 38.3 | 33.0 | 12.0 | 0.0 | 15.2 | 25.9 |
| 40 | 1 | 520.7 | 336.1 | 0.1 | 45.8 | 50.9 | 16.1 | 0.0 | 21.0 | 48.3 |
| 50 | 1 | 608.1 | 375.8 | 0.1 | 49.9 | 74.4 | 22.9 | 0.0 | 27.7 | 55.3 |
| 60 | 1 | 724.5 | 418.5 | 0.1 | 64.9 | 99.3 | 22.7 | 0.0 | 35.1 | 81.8 |
| 70 | 1 | 859.4 | 483.3 | 0.1 | 82.4 | 133.1 | 24.9 | 0.0 | 42.6 | 90.9 |
| 80 | 3 | 986.9 | 525.2 | 0.2 | 92.8 | 171.2 | 28.9 | 0.0 | 50.2 | 120.9 |
| 90 | 1 | 1152.2 | 586.9 | 0.1 | 104.4 | 212.4 | 32.0 | 0.0 | 59.1 | 155.0 |
| 100 | 1 | 1323.8 | 637.3 | 0.2 | 118.1 | 260.5 | 36.9 | 0.0 | 69.0 | 199.5 |
| 110 | 1 | 1472.2 | 684.3 | 0.2 | 111.4 | 307.7 | 40.4 | 0.0 | 75.5 | 250.4 |
| 120 | 1 | 1647.1 | 744.8 | 0.2 | 116.0 | 354.7 | 42.3 | 0.0 | 86.5 | 299.7 |
| 130 | 1 | 1871.1 | 796.8 | 0.2 | 115.5 | 422.2 | 45.8 | 0.0 | 97.5 | 390.7 |
| 140 | 3 | 1952.4 | 865.7 | 0.3 | 121.6 | 464.0 | 48.5 | 0.0 | 107.4 | 343.5 |
| 150 | 1 | 2181.4 | 943.5 | 0.3 | 128.9 | 541.2 | 51.5 | 0.0 | 118.8 | 394.6 |
| 160 | 1 | 2387.0 | 981.6 | 0.3 | 142.9 | 620.4 | 56.0 | 0.0 | 129.5 | 453.6 |
| 170 | 1 | 2638.5 | 1026.9 | 0.3 | 168.8 | 713.9 | 58.6 | 0.0 | 144.0 | 523.2 |
| 180 | 3 | 2826.5 | 1074.5 | 0.3 | 157.6 | 768.3 | 60.8 | 0.0 | 153.7 | 601.0 |
| 190 | 1 | 3054.2 | 1109.2 | 0.4 | 163.9 | 860.8 | 63.1 | 0.0 | 166.0 | 683.9 |
| 200 | 1 | 3349.3 | 1168.0 | 0.4 | 171.4 | 971.9 | 67.3 | 0.0 | 181.2 | 786.2 |
| 210 | 3 | 3620.1 | 1245.7 | 0.3 | 184.8 | 1056.6 | 71.2 | 0.0 | 194.3 | 861.7 |
| 220 | 3 | 3960.4 | 1326.3 | 0.4 | 195.8 | 1155.4 | 74.0 | 0.0 | 208.8 | 996.5 |
| 230 | 1 | 4249.8 | 1357.5 | 0.4 | 217.8 | 1262.1 | 78.5 | 0.0 | 227.9 | 1102.6 |
| 240 | 1 | 4498.7 | 1390.0 | 0.4 | 212.8 | 1372.2 | 82.2 | 0.0 | 242.1 | 1195.8 |
| 250 | 3 | 4896.4 | 1470.7 | 0.4 | 236.7 | 1478.9 | 84.9 | 0.0 | 259.9 | 1341.2 |

Raw profiler events and call counts are in [raw.json](raw.json); selected phase medians are in [summary.csv](summary.csv).
