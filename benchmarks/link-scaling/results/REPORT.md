# Cold link scaling results

Generated: 2026-11-24T20:15:21.517Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes followed by one edit to a single component file. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate memory footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 71,578 lines, 7,590 linked elements, 10,204 linked edges.
- Median cold link time grows from 282.7 ms to 4873.9 ms.
- Median one-file incremental link time grows from 26.8 ms to 71.8 ms; at full scale it reparses 1 and relinks 1 source with 13 direct support sources.
- Median peak RSS grows from 142.6 MiB to 1003.7 MiB.
- Ordinary least-squares slope across all points: 18.94 ms/service and 2.81 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median cold link, ms | Median incremental link, ms | Incremental support sources | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 390 | 398 | 282.7 | 26.8 | 17 | 142.6 | 60.4 |
| 20 | 96 | 690 | 803 | 337.4 | 21.1 | 5 | 202.8 | 120.8 |
| 30 | 136 | 990 | 1213 | 394.5 | 25.0 | 13 | 288.1 | 205.7 |
| 40 | 176 | 1290 | 1623 | 521.2 | 38.1 | 41 | 315.9 | 233.5 |
| 50 | 216 | 1590 | 2030 | 607.6 | 31.8 | 21 | 350.4 | 267.5 |
| 60 | 256 | 1890 | 2438 | 759.8 | 31.0 | 9 | 378.2 | 295.0 |
| 70 | 296 | 2190 | 2848 | 841.9 | 33.5 | 13 | 404.2 | 321.0 |
| 80 | 336 | 2490 | 3256 | 983.8 | 31.8 | 5 | 473.5 | 388.2 |
| 90 | 376 | 2790 | 3666 | 1147.9 | 44.5 | 33 | 539.4 | 453.6 |
| 100 | 416 | 3090 | 4073 | 1294.8 | 39.5 | 13 | 548.5 | 463.7 |
| 110 | 456 | 3390 | 4483 | 1457.5 | 45.9 | 25 | 577.2 | 491.9 |
| 120 | 496 | 3690 | 4892 | 1668.1 | 41.0 | 5 | 567.4 | 482.9 |
| 130 | 536 | 3990 | 5301 | 1844.1 | 51.7 | 29 | 585.6 | 499.6 |
| 140 | 576 | 4290 | 5708 | 1965.8 | 50.2 | 25 | 594.5 | 508.4 |
| 150 | 616 | 4590 | 6117 | 2151.4 | 45.5 | 5 | 610.9 | 521.9 |
| 160 | 656 | 4890 | 6526 | 2393.2 | 53.7 | 17 | 634.3 | 547.2 |
| 170 | 696 | 5190 | 6936 | 2625.5 | 61.4 | 33 | 682.4 | 594.8 |
| 180 | 736 | 5490 | 7344 | 2806.8 | 59.8 | 21 | 694.9 | 603.1 |
| 190 | 776 | 5790 | 7751 | 3073.7 | 61.5 | 17 | 675.6 | 587.7 |
| 200 | 816 | 6090 | 8161 | 3313.2 | 72.2 | 17 | 690.5 | 597.4 |
| 210 | 856 | 6390 | 8569 | 3621.1 | 64.6 | 9 | 702.0 | 612.6 |
| 220 | 896 | 6690 | 8979 | 3916.7 | 70.7 | 25 | 780.8 | 686.7 |
| 230 | 936 | 6990 | 9386 | 4236.1 | 68.0 | 13 | 831.3 | 742.2 |
| 240 | 976 | 7290 | 9794 | 4589.4 | 68.6 | 9 | 921.8 | 826.1 |
| 250 | 1016 | 7590 | 10204 | 4873.9 | 71.8 | 13 | 1003.7 | 911.8 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
