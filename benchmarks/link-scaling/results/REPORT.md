# Cold link scaling results

Generated: 2026-11-22T16:10:14.041Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes followed by one edit to a single component file. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate memory footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 71,578 lines, 7,590 linked elements, 10,204 linked edges.
- Median cold link time grows from 278.7 ms to 4860.5 ms.
- Median one-file incremental link time grows from 26.5 ms to 70.9 ms; at full scale it reparses 1 and relinks 1 source with 13 direct support sources.
- Median peak RSS grows from 142.5 MiB to 966.0 MiB.
- Ordinary least-squares slope across all points: 18.86 ms/service and 2.69 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median cold link, ms | Median incremental link, ms | Incremental support sources | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 390 | 398 | 278.7 | 26.5 | 17 | 142.5 | 61.0 |
| 20 | 96 | 690 | 803 | 334.6 | 20.5 | 5 | 200.1 | 118.0 |
| 30 | 136 | 990 | 1213 | 392.2 | 25.4 | 13 | 280.9 | 198.4 |
| 40 | 176 | 1290 | 1623 | 500.2 | 36.8 | 41 | 294.7 | 212.3 |
| 50 | 216 | 1590 | 2030 | 613.1 | 32.3 | 21 | 357.1 | 274.4 |
| 60 | 256 | 1890 | 2438 | 713.9 | 29.7 | 9 | 377.2 | 293.5 |
| 70 | 296 | 2190 | 2848 | 852.2 | 33.1 | 13 | 383.6 | 299.7 |
| 80 | 336 | 2490 | 3256 | 985.4 | 30.6 | 5 | 428.2 | 343.8 |
| 90 | 376 | 2790 | 3666 | 1134.7 | 43.6 | 33 | 531.8 | 447.2 |
| 100 | 416 | 3090 | 4073 | 1304.9 | 38.7 | 13 | 542.3 | 458.1 |
| 110 | 456 | 3390 | 4483 | 1449.9 | 45.7 | 25 | 563.5 | 479.1 |
| 120 | 496 | 3690 | 4892 | 1629.5 | 40.2 | 5 | 561.4 | 476.9 |
| 130 | 536 | 3990 | 5301 | 1830.2 | 51.4 | 29 | 579.0 | 492.4 |
| 140 | 576 | 4290 | 5708 | 1944.9 | 52.8 | 25 | 601.4 | 516.4 |
| 150 | 616 | 4590 | 6117 | 2130.9 | 44.9 | 5 | 603.3 | 514.9 |
| 160 | 656 | 4890 | 6526 | 2348.4 | 52.4 | 17 | 607.6 | 518.6 |
| 170 | 696 | 5190 | 6936 | 2614.7 | 59.0 | 33 | 683.3 | 594.0 |
| 180 | 736 | 5490 | 7344 | 2806.1 | 56.7 | 21 | 674.9 | 583.8 |
| 190 | 776 | 5790 | 7751 | 3083.4 | 57.4 | 17 | 688.8 | 596.7 |
| 200 | 816 | 6090 | 8161 | 3344.5 | 61.7 | 17 | 683.6 | 593.1 |
| 210 | 856 | 6390 | 8569 | 3574.2 | 60.9 | 9 | 687.8 | 594.6 |
| 220 | 896 | 6690 | 8979 | 3882.6 | 70.5 | 25 | 732.0 | 637.7 |
| 230 | 936 | 6990 | 9386 | 4196.4 | 65.3 | 13 | 782.4 | 693.5 |
| 240 | 976 | 7290 | 9794 | 4552.3 | 64.1 | 9 | 871.0 | 777.0 |
| 250 | 1016 | 7590 | 10204 | 4860.5 | 70.9 | 13 | 966.0 | 870.0 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
