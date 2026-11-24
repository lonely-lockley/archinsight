# Cold link scaling results

Generated: 2026-11-24T19:19:48.946Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes followed by one edit to a single component file. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate memory footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 71,578 lines, 7,590 linked elements, 10,204 linked edges.
- Median cold link time grows from 278.5 ms to 4763.4 ms.
- Median one-file incremental link time grows from 26.1 ms to 70.5 ms; at full scale it reparses 1 and relinks 1 source with 13 direct support sources.
- Median peak RSS grows from 142.7 MiB to 991.2 MiB.
- Ordinary least-squares slope across all points: 18.80 ms/service and 2.71 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median cold link, ms | Median incremental link, ms | Incremental support sources | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 390 | 398 | 278.5 | 26.1 | 17 | 142.7 | 61.0 |
| 20 | 96 | 690 | 803 | 339.4 | 20.8 | 5 | 200.8 | 118.2 |
| 30 | 136 | 990 | 1213 | 394.8 | 25.8 | 13 | 284.0 | 201.4 |
| 40 | 176 | 1290 | 1623 | 501.2 | 38.0 | 41 | 319.0 | 236.3 |
| 50 | 216 | 1590 | 2030 | 602.4 | 32.2 | 21 | 356.3 | 272.6 |
| 60 | 256 | 1890 | 2438 | 721.7 | 30.0 | 9 | 379.0 | 296.0 |
| 70 | 296 | 2190 | 2848 | 830.7 | 32.5 | 13 | 405.3 | 320.2 |
| 80 | 336 | 2490 | 3256 | 974.8 | 31.1 | 5 | 470.9 | 387.1 |
| 90 | 376 | 2790 | 3666 | 1129.2 | 45.2 | 33 | 533.3 | 447.6 |
| 100 | 416 | 3090 | 4073 | 1290.5 | 38.6 | 13 | 547.8 | 461.2 |
| 110 | 456 | 3390 | 4483 | 1460.3 | 45.2 | 25 | 558.7 | 473.7 |
| 120 | 496 | 3690 | 4892 | 1640.0 | 40.4 | 5 | 566.0 | 478.9 |
| 130 | 536 | 3990 | 5301 | 1832.3 | 51.0 | 29 | 588.6 | 502.6 |
| 140 | 576 | 4290 | 5708 | 1930.7 | 51.9 | 25 | 599.8 | 513.5 |
| 150 | 616 | 4590 | 6117 | 2137.2 | 45.4 | 5 | 608.7 | 521.9 |
| 160 | 656 | 4890 | 6526 | 2370.6 | 52.7 | 17 | 612.8 | 526.3 |
| 170 | 696 | 5190 | 6936 | 2592.7 | 61.1 | 33 | 617.9 | 530.4 |
| 180 | 736 | 5490 | 7344 | 2813.3 | 59.6 | 21 | 683.2 | 591.7 |
| 190 | 776 | 5790 | 7751 | 3068.9 | 59.1 | 17 | 700.7 | 608.4 |
| 200 | 816 | 6090 | 8161 | 3336.7 | 61.9 | 17 | 692.6 | 603.0 |
| 210 | 856 | 6390 | 8569 | 3604.0 | 60.7 | 9 | 723.2 | 629.3 |
| 220 | 896 | 6690 | 8979 | 3906.9 | 69.6 | 25 | 718.3 | 628.1 |
| 230 | 936 | 6990 | 9386 | 4211.8 | 67.7 | 13 | 785.1 | 695.8 |
| 240 | 976 | 7290 | 9794 | 4529.4 | 68.1 | 9 | 911.7 | 820.5 |
| 250 | 1016 | 7590 | 10204 | 4763.4 | 70.5 | 13 | 991.2 | 894.7 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
