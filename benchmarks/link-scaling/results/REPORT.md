# Cold link scaling results

Generated: 2026-11-22T11:36:07.379Z

Host: Apple M5 Max, 18 logical CPUs, 36.0 GiB RAM, v24.18.0, darwin/arm64.

Each point is the median of 3 independent cold links in fresh Node.js processes. Source files are loaded before timing. Peak RSS includes the language runtime and loaded source strings; the final column subtracts RSS immediately before linking to expose the linker's approximate incremental footprint.

Parse mode: parallel, up to 4 workers.

![Link scaling](scaling.svg)

## Summary

- Full scale (250 services): 1016 files, 71,578 lines, 7,590 linked elements, 10,204 linked edges.
- Median cold link time grows from 279.6 ms to 4826.6 ms.
- Median peak RSS grows from 142.3 MiB to 906.9 MiB.
- Ordinary least-squares slope across all points: 18.82 ms/service and 2.62 MiB/service. Use the plotted curve, not only the slope, to spot nonlinear growth.

## Measurements

| Services | Sources | Elements | Edges | Median link, ms | Peak RSS, MiB | Link RSS delta, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 56 | 390 | 398 | 279.6 | 142.3 | 60.8 |
| 20 | 96 | 690 | 803 | 330.1 | 201.4 | 119.5 |
| 30 | 136 | 990 | 1213 | 389.5 | 290.3 | 208.6 |
| 40 | 176 | 1290 | 1623 | 496.1 | 301.6 | 218.9 |
| 50 | 216 | 1590 | 2030 | 603.0 | 357.9 | 275.0 |
| 60 | 256 | 1890 | 2438 | 704.5 | 372.3 | 289.5 |
| 70 | 296 | 2190 | 2848 | 830.9 | 389.9 | 306.2 |
| 80 | 336 | 2490 | 3256 | 971.0 | 428.4 | 344.6 |
| 90 | 376 | 2790 | 3666 | 1106.7 | 532.5 | 448.2 |
| 100 | 416 | 3090 | 4073 | 1272.0 | 555.3 | 471.1 |
| 110 | 456 | 3390 | 4483 | 1436.8 | 560.8 | 476.3 |
| 120 | 496 | 3690 | 4892 | 1614.2 | 563.6 | 478.8 |
| 130 | 536 | 3990 | 5301 | 1809.4 | 582.3 | 497.1 |
| 140 | 576 | 4290 | 5708 | 1933.2 | 585.4 | 499.8 |
| 150 | 616 | 4590 | 6117 | 2107.7 | 598.0 | 511.2 |
| 160 | 656 | 4890 | 6526 | 2340.1 | 617.0 | 529.7 |
| 170 | 696 | 5190 | 6936 | 2575.9 | 659.7 | 571.6 |
| 180 | 736 | 5490 | 7344 | 2771.4 | 669.6 | 581.9 |
| 190 | 776 | 5790 | 7751 | 3027.0 | 659.8 | 572.3 |
| 200 | 816 | 6090 | 8161 | 3294.3 | 696.8 | 605.4 |
| 210 | 856 | 6390 | 8569 | 3616.3 | 741.3 | 649.5 |
| 220 | 896 | 6690 | 8979 | 3873.9 | 759.1 | 666.9 |
| 230 | 936 | 6990 | 9386 | 4210.1 | 803.8 | 714.5 |
| 240 | 976 | 7290 | 9794 | 4543.1 | 803.0 | 709.6 |
| 250 | 1016 | 7590 | 10204 | 4826.6 | 906.9 | 813.2 |

Raw trials are in [raw.json](raw.json); machine-readable medians and ranges are in [summary.csv](summary.csv).
