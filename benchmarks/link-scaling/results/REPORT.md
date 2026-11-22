# Cold link scaling results

Generated: 2026-11-22T11:01:47.200Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate incremental footprint.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 71,578 lines, 7,590 linked elements, 10,204 linked edges.
- Median cold link time grows from 378.6 ms to 9838.1 ms.
- Median peak RSS grows from 147.4 MiB to 469.3 MiB.
- Ordinary least-squares slope across all points: 39.05 ms/service and 1.18 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median link, ms | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 390 | 398 | 378.6 | 147.4 | 65.9 |
| 20 | 96 | 690 | 803 | 665.3 | 158.8 | 77.1 |
| 30 | 136 | 990 | 1213 | 973.5 | 237.9 | 156.1 |
| 40 | 176 | 1290 | 1623 | 1254.1 | 245.8 | 163.8 |
| 50 | 216 | 1590 | 2030 | 1561.3 | 254.2 | 171.5 |
| 60 | 256 | 1890 | 2438 | 1894.5 | 266.7 | 183.6 |
| 70 | 296 | 2190 | 2848 | 2222.4 | 278.1 | 194.4 |
| 80 | 336 | 2490 | 3256 | 2529.6 | 287.1 | 203.5 |
| 90 | 376 | 2790 | 3666 | 2873.8 | 297.9 | 213.8 |
| 100 | 416 | 3090 | 4073 | 3234.7 | 305.9 | 221.5 |
| 110 | 456 | 3390 | 4483 | 3613.5 | 323.2 | 238.5 |
| 120 | 496 | 3690 | 4892 | 4010.3 | 335.7 | 250.5 |
| 130 | 536 | 3990 | 5301 | 4391.7 | 343.0 | 257.5 |
| 140 | 576 | 4290 | 5708 | 4755.9 | 355.2 | 268.8 |
| 150 | 616 | 4590 | 6117 | 5130.0 | 367.4 | 281.0 |
| 160 | 656 | 4890 | 6526 | 5514.1 | 382.4 | 296.3 |
| 170 | 696 | 5190 | 6936 | 5956.2 | 384.7 | 296.6 |
| 180 | 736 | 5490 | 7344 | 6385.7 | 402.1 | 314.3 |
| 190 | 776 | 5790 | 7751 | 6871.1 | 408.4 | 318.6 |
| 200 | 816 | 6090 | 8161 | 7341.4 | 419.0 | 328.2 |
| 210 | 856 | 6390 | 8569 | 7754.9 | 427.5 | 339.0 |
| 220 | 896 | 6690 | 8979 | 8242.6 | 431.7 | 340.3 |
| 230 | 936 | 6990 | 9386 | 8833.3 | 444.6 | 352.7 |
| 240 | 976 | 7290 | 9794 | 9290.5 | 456.5 | 363.8 |
| 250 | 1016 | 7590 | 10204 | 9838.1 | 469.3 | 376.3 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
