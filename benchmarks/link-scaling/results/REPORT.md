# Cold link scaling results

Generated: 2026-11-24T14:01:18.891Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes followed by one edit to a single component file. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate memory footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 71,578 lines, 7,590 linked elements, 10,204 linked edges.
- Median cold link time grows from 285.8 ms to 4872.3 ms.
- Median one-file incremental link time grows from 26.3 ms to 71.6 ms; at full scale it reparses 1 and relinks 1 source with 13 direct support sources.
- Median peak RSS grows from 143.1 MiB to 1001.1 MiB.
- Ordinary least-squares slope across all points: 19.01 ms/service and 2.79 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median cold link, ms | Median incremental link, ms | Incremental support sources | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 390 | 398 | 285.8 | 26.3 | 17 | 143.1 | 61.3 |
| 20 | 96 | 690 | 803 | 339.1 | 21.2 | 5 | 200.8 | 118.9 |
| 30 | 136 | 990 | 1213 | 401.2 | 25.8 | 13 | 280.4 | 197.3 |
| 40 | 176 | 1290 | 1623 | 511.6 | 38.0 | 41 | 305.8 | 222.9 |
| 50 | 216 | 1590 | 2030 | 603.0 | 32.8 | 21 | 347.1 | 264.2 |
| 60 | 256 | 1890 | 2438 | 726.3 | 29.4 | 9 | 365.6 | 282.8 |
| 70 | 296 | 2190 | 2848 | 843.5 | 32.6 | 13 | 387.8 | 303.9 |
| 80 | 336 | 2490 | 3256 | 1001.1 | 32.1 | 5 | 483.6 | 399.7 |
| 90 | 376 | 2790 | 3666 | 1142.7 | 46.2 | 33 | 524.3 | 438.7 |
| 100 | 416 | 3090 | 4073 | 1300.8 | 41.3 | 13 | 544.6 | 460.2 |
| 110 | 456 | 3390 | 4483 | 1480.4 | 45.7 | 25 | 554.2 | 469.2 |
| 120 | 496 | 3690 | 4892 | 1684.7 | 40.7 | 5 | 570.9 | 485.5 |
| 130 | 536 | 3990 | 5301 | 1829.1 | 51.6 | 29 | 587.6 | 499.8 |
| 140 | 576 | 4290 | 5708 | 1970.9 | 52.9 | 25 | 603.1 | 514.3 |
| 150 | 616 | 4590 | 6117 | 2163.0 | 46.5 | 5 | 599.5 | 512.6 |
| 160 | 656 | 4890 | 6526 | 2414.8 | 55.6 | 17 | 618.7 | 531.8 |
| 170 | 696 | 5190 | 6936 | 2631.3 | 63.0 | 33 | 658.8 | 571.4 |
| 180 | 736 | 5490 | 7344 | 2850.4 | 58.1 | 21 | 706.6 | 616.1 |
| 190 | 776 | 5790 | 7751 | 3096.6 | 58.3 | 17 | 686.0 | 596.9 |
| 200 | 816 | 6090 | 8161 | 3357.8 | 62.6 | 17 | 688.2 | 598.6 |
| 210 | 856 | 6390 | 8569 | 3616.7 | 63.4 | 9 | 722.8 | 632.7 |
| 220 | 896 | 6690 | 8979 | 3930.4 | 70.8 | 25 | 729.7 | 635.1 |
| 230 | 936 | 6990 | 9386 | 4257.1 | 66.6 | 13 | 782.3 | 686.8 |
| 240 | 976 | 7290 | 9794 | 4568.2 | 65.7 | 9 | 931.6 | 840.8 |
| 250 | 1016 | 7590 | 10204 | 4872.3 | 71.6 | 13 | 1001.1 | 909.7 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
