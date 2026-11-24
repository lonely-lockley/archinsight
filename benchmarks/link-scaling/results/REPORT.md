# Cold link scaling results

Generated: 2026-11-24T13:01:15.372Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes followed by one edit to a single component file. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate memory footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 71,578 lines, 7,590 linked elements, 10,204 linked edges.
- Median cold link time grows from 284.9 ms to 4914.2 ms.
- Median one-file incremental link time grows from 26.0 ms to 72.6 ms; at full scale it reparses 1 and relinks 1 source with 13 direct support sources.
- Median peak RSS grows from 144.8 MiB to 996.0 MiB.
- Ordinary least-squares slope across all points: 19.06 ms/service and 2.73 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median cold link, ms | Median incremental link, ms | Incremental support sources | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 390 | 398 | 284.9 | 26.0 | 17 | 144.8 | 62.8 |
| 20 | 96 | 690 | 803 | 341.6 | 21.2 | 5 | 202.2 | 119.9 |
| 30 | 136 | 990 | 1213 | 396.7 | 25.5 | 13 | 285.2 | 202.4 |
| 40 | 176 | 1290 | 1623 | 527.3 | 37.4 | 41 | 321.1 | 238.1 |
| 50 | 216 | 1590 | 2030 | 609.9 | 32.4 | 21 | 362.9 | 280.7 |
| 60 | 256 | 1890 | 2438 | 732.4 | 30.1 | 9 | 368.9 | 285.1 |
| 70 | 296 | 2190 | 2848 | 853.7 | 33.2 | 13 | 385.3 | 301.6 |
| 80 | 336 | 2490 | 3256 | 1004.7 | 31.8 | 5 | 462.9 | 378.7 |
| 90 | 376 | 2790 | 3666 | 1152.0 | 46.0 | 33 | 521.8 | 435.8 |
| 100 | 416 | 3090 | 4073 | 1313.7 | 39.7 | 13 | 545.5 | 459.0 |
| 110 | 456 | 3390 | 4483 | 1481.5 | 45.7 | 25 | 565.0 | 480.6 |
| 120 | 496 | 3690 | 4892 | 1660.0 | 40.9 | 5 | 578.0 | 491.0 |
| 130 | 536 | 3990 | 5301 | 1826.4 | 51.7 | 29 | 595.5 | 510.5 |
| 140 | 576 | 4290 | 5708 | 1962.0 | 55.2 | 25 | 602.9 | 516.2 |
| 150 | 616 | 4590 | 6117 | 2166.9 | 46.8 | 5 | 602.5 | 515.8 |
| 160 | 656 | 4890 | 6526 | 2391.8 | 53.8 | 17 | 620.7 | 531.0 |
| 170 | 696 | 5190 | 6936 | 2612.3 | 62.1 | 33 | 627.8 | 537.1 |
| 180 | 736 | 5490 | 7344 | 2854.6 | 58.9 | 21 | 668.0 | 579.3 |
| 190 | 776 | 5790 | 7751 | 3120.2 | 60.1 | 17 | 673.7 | 580.9 |
| 200 | 816 | 6090 | 8161 | 3347.3 | 63.6 | 17 | 694.1 | 601.5 |
| 210 | 856 | 6390 | 8569 | 3650.0 | 60.7 | 9 | 691.4 | 601.4 |
| 220 | 896 | 6690 | 8979 | 3944.5 | 70.8 | 25 | 736.5 | 647.7 |
| 230 | 936 | 6990 | 9386 | 4273.7 | 66.0 | 13 | 812.3 | 722.2 |
| 240 | 976 | 7290 | 9794 | 4564.7 | 65.5 | 9 | 915.4 | 824.5 |
| 250 | 1016 | 7590 | 10204 | 4914.2 | 72.6 | 13 | 996.0 | 904.9 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
