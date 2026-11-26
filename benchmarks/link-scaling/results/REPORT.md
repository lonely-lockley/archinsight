# Cold link scaling results

Generated: 2026-11-26T06:56:58.013Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes followed by one edit to a single component file. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate memory footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 73,016 lines, 7,620 linked elements, 20,764 linked edges.
- Median cold link time grows from 322.6 ms to 2928.4 ms.
- Median one-file incremental link time grows from 29.9 ms to 99.0 ms; at full scale it reparses 1 and relinks 1 source with 13 direct support sources.
- Median peak RSS grows from 147.3 MiB to 1021.1 MiB.
- Ordinary least-squares slope across all points: 11.20 ms/service and 2.93 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median cold link, ms | Median incremental link, ms | Incremental support sources | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 420 | 668 | 322.6 | 29.9 | 17 | 147.3 | 65.3 |
| 20 | 96 | 720 | 1448 | 378.4 | 24.4 | 5 | 203.4 | 120.8 |
| 30 | 136 | 1020 | 2308 | 423.0 | 30.9 | 13 | 289.5 | 206.2 |
| 40 | 176 | 1320 | 3168 | 530.2 | 45.0 | 41 | 315.3 | 231.6 |
| 50 | 216 | 1620 | 3980 | 630.4 | 39.5 | 21 | 354.1 | 270.6 |
| 60 | 256 | 1920 | 4808 | 726.0 | 37.4 | 9 | 372.3 | 288.8 |
| 70 | 296 | 2220 | 5668 | 853.6 | 41.7 | 13 | 413.8 | 329.6 |
| 80 | 336 | 2520 | 6496 | 943.2 | 41.4 | 5 | 514.5 | 430.0 |
| 90 | 376 | 2820 | 7356 | 1040.8 | 55.5 | 33 | 531.1 | 446.4 |
| 100 | 416 | 3120 | 8168 | 1174.0 | 52.4 | 13 | 545.6 | 460.1 |
| 110 | 456 | 3420 | 9028 | 1274.8 | 57.6 | 25 | 571.2 | 485.1 |
| 120 | 496 | 3720 | 9872 | 1382.0 | 53.4 | 5 | 573.3 | 486.6 |
| 130 | 536 | 4020 | 10716 | 1501.3 | 66.7 | 29 | 583.3 | 496.4 |
| 140 | 576 | 4320 | 11528 | 1608.3 | 67.9 | 25 | 593.5 | 506.3 |
| 150 | 616 | 4620 | 12372 | 1729.3 | 61.2 | 5 | 616.1 | 528.9 |
| 160 | 656 | 4920 | 13216 | 1827.0 | 71.7 | 17 | 619.2 | 531.5 |
| 170 | 696 | 5220 | 14076 | 1932.4 | 78.5 | 33 | 640.5 | 552.8 |
| 180 | 736 | 5520 | 14904 | 2072.7 | 77.2 | 21 | 672.7 | 583.2 |
| 190 | 776 | 5820 | 15716 | 2186.6 | 81.6 | 17 | 698.1 | 607.7 |
| 200 | 816 | 6120 | 16576 | 2345.3 | 89.4 | 17 | 702.0 | 611.5 |
| 210 | 856 | 6420 | 17404 | 2444.5 | 86.7 | 9 | 716.6 | 625.5 |
| 220 | 896 | 6720 | 18264 | 2581.0 | 94.1 | 25 | 782.4 | 691.2 |
| 230 | 936 | 7020 | 19076 | 2686.0 | 92.5 | 13 | 900.4 | 809.1 |
| 240 | 976 | 7320 | 19904 | 2843.7 | 93.6 | 9 | 1003.2 | 910.9 |
| 250 | 1016 | 7620 | 20764 | 2928.4 | 99.0 | 13 | 1021.1 | 928.7 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
