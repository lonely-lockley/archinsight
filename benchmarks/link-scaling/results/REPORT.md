# Cold link scaling results

Generated: 2026-11-25T06:10:03.435Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes followed by one edit to a single component file. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate memory footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 71,578 lines, 7,590 linked elements, 10,204 linked edges.
- Median cold link time grows from 277.8 ms to 4886.0 ms.
- Median one-file incremental link time grows from 27.5 ms to 75.8 ms; at full scale it reparses 1 and relinks 1 source with 13 direct support sources.
- Median peak RSS grows from 143.0 MiB to 999.8 MiB.
- Ordinary least-squares slope across all points: 19.00 ms/service and 2.82 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median cold link, ms | Median incremental link, ms | Incremental support sources | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 390 | 398 | 277.8 | 27.5 | 17 | 143.0 | 61.4 |
| 20 | 96 | 690 | 803 | 344.9 | 22.3 | 5 | 200.9 | 119.4 |
| 30 | 136 | 990 | 1213 | 399.2 | 26.4 | 13 | 284.1 | 201.9 |
| 40 | 176 | 1290 | 1623 | 508.2 | 38.0 | 41 | 296.6 | 214.3 |
| 50 | 216 | 1590 | 2030 | 602.1 | 34.5 | 21 | 362.5 | 279.5 |
| 60 | 256 | 1890 | 2438 | 727.0 | 31.5 | 9 | 382.5 | 298.4 |
| 70 | 296 | 2190 | 2848 | 854.4 | 35.3 | 13 | 398.9 | 315.1 |
| 80 | 336 | 2490 | 3256 | 989.1 | 34.1 | 5 | 474.7 | 391.3 |
| 90 | 376 | 2790 | 3666 | 1144.7 | 47.5 | 33 | 533.2 | 447.3 |
| 100 | 416 | 3090 | 4073 | 1317.2 | 42.0 | 13 | 539.8 | 455.4 |
| 110 | 456 | 3390 | 4483 | 1460.9 | 48.0 | 25 | 553.6 | 466.4 |
| 120 | 496 | 3690 | 4892 | 1667.7 | 47.2 | 5 | 585.2 | 500.8 |
| 130 | 536 | 3990 | 5301 | 1842.9 | 55.0 | 29 | 584.3 | 499.6 |
| 140 | 576 | 4290 | 5708 | 1986.6 | 55.5 | 25 | 592.3 | 506.0 |
| 150 | 616 | 4590 | 6117 | 2203.7 | 49.8 | 5 | 597.5 | 507.6 |
| 160 | 656 | 4890 | 6526 | 2395.5 | 57.8 | 17 | 625.0 | 535.0 |
| 170 | 696 | 5190 | 6936 | 2624.5 | 64.9 | 33 | 627.2 | 539.1 |
| 180 | 736 | 5490 | 7344 | 2823.5 | 63.2 | 21 | 676.0 | 584.4 |
| 190 | 776 | 5790 | 7751 | 3067.1 | 66.3 | 17 | 669.2 | 579.1 |
| 200 | 816 | 6090 | 8161 | 3356.4 | 72.0 | 17 | 749.6 | 656.4 |
| 210 | 856 | 6390 | 8569 | 3617.7 | 64.5 | 9 | 718.9 | 628.5 |
| 220 | 896 | 6690 | 8979 | 3960.5 | 77.1 | 25 | 697.2 | 606.7 |
| 230 | 936 | 6990 | 9386 | 4218.7 | 72.1 | 13 | 816.9 | 726.4 |
| 240 | 976 | 7290 | 9794 | 4571.9 | 73.0 | 9 | 984.9 | 893.8 |
| 250 | 1016 | 7590 | 10204 | 4886.0 | 75.8 | 13 | 999.8 | 908.1 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
