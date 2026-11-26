# Cold link scaling results

Generated: 2026-11-26T07:56:16.228Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes followed by one edit to a single component file. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate memory footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 73,016 lines, 7,620 linked elements, 20,764 linked edges.
- Median cold link time grows from 321.5 ms to 2996.7 ms.
- Median one-file incremental link time grows from 29.5 ms to 98.8 ms; at full scale it reparses 1 and relinks 1 source with 13 direct support sources.
- Median peak RSS grows from 147.1 MiB to 1013.1 MiB.
- Ordinary least-squares slope across all points: 11.31 ms/service and 2.86 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median cold link, ms | Median incremental link, ms | Incremental support sources | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 420 | 668 | 321.5 | 29.5 | 17 | 147.1 | 64.6 |
| 20 | 96 | 720 | 1448 | 376.1 | 24.3 | 5 | 202.7 | 119.8 |
| 30 | 136 | 1020 | 2308 | 422.3 | 30.8 | 13 | 313.2 | 229.7 |
| 40 | 176 | 1320 | 3168 | 532.0 | 44.0 | 41 | 303.0 | 219.3 |
| 50 | 216 | 1620 | 3980 | 646.5 | 39.1 | 21 | 357.3 | 273.7 |
| 60 | 256 | 1920 | 4808 | 728.2 | 37.8 | 9 | 364.5 | 280.1 |
| 70 | 296 | 2220 | 5668 | 850.3 | 44.5 | 13 | 406.7 | 321.7 |
| 80 | 336 | 2520 | 6496 | 942.5 | 41.9 | 5 | 499.8 | 414.9 |
| 90 | 376 | 2820 | 7356 | 1059.2 | 56.9 | 33 | 542.4 | 456.8 |
| 100 | 416 | 3120 | 8168 | 1163.8 | 51.4 | 13 | 548.1 | 462.7 |
| 110 | 456 | 3420 | 9028 | 1291.6 | 60.0 | 25 | 557.6 | 471.9 |
| 120 | 496 | 3720 | 9872 | 1409.9 | 53.6 | 5 | 589.0 | 502.3 |
| 130 | 536 | 4020 | 10716 | 1517.2 | 65.9 | 29 | 600.7 | 513.6 |
| 140 | 576 | 4320 | 11528 | 1625.5 | 68.2 | 25 | 599.6 | 511.7 |
| 150 | 616 | 4620 | 12372 | 1725.2 | 61.7 | 5 | 617.8 | 529.8 |
| 160 | 656 | 4920 | 13216 | 1864.9 | 71.1 | 17 | 613.5 | 525.7 |
| 170 | 696 | 5220 | 14076 | 1978.8 | 78.0 | 33 | 661.3 | 573.0 |
| 180 | 736 | 5520 | 14904 | 2104.3 | 77.5 | 21 | 686.2 | 597.0 |
| 190 | 776 | 5820 | 15716 | 2187.1 | 79.9 | 17 | 673.5 | 585.0 |
| 200 | 816 | 6120 | 16576 | 2343.9 | 83.2 | 17 | 690.1 | 599.7 |
| 210 | 856 | 6420 | 17404 | 2424.5 | 84.9 | 9 | 716.5 | 625.5 |
| 220 | 896 | 6720 | 18264 | 2627.7 | 94.5 | 25 | 731.1 | 639.3 |
| 230 | 936 | 7020 | 19076 | 2712.2 | 95.0 | 13 | 889.5 | 797.3 |
| 240 | 976 | 7320 | 19904 | 2825.5 | 93.9 | 9 | 997.2 | 904.3 |
| 250 | 1016 | 7620 | 20764 | 2996.7 | 98.8 | 13 | 1013.1 | 919.8 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
