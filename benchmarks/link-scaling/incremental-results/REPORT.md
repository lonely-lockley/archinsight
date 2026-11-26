# Incremental graph-change scenarios

Generated: 2026-11-26T07:58:01.128Z

Each scenario edits one source in the full 250-service repository after a cold session has been created. Values are medians of 3 independent processes. The baseline has 1016 sources, 7620 elements, 20764 edges, and 14310 projected edges.

![Incremental scenario times](scenario-times.svg)

| Scenario | Median, ms | Support sources | Relinked sources | Final edges | Projected edges | Edge delta | Deployment, ms | Projections, ms | Inspection, ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| relationship-topology | 2275.6 | 1016 | 1 | 20764 | 14310 | +16 / -16 / ~0 | 48.1 | 563.1 | 24.0 |
| environment-attribute | 70.0 | 2 | 1 | 20764 | 14310 | +0 / -0 / ~0 | 0.0 | 0.0 | 0.1 |
| environment-projection | 2760.9 | 1016 | 251 | 20514 | 14060 | +0 / -250 / ~0 | 44.5 | 515.2 | 18.5 |

The attribute scenario changes only environment metadata. Relationship and projection scenarios change graph topology and therefore use the conservative global invalidation path. Raw trials and every recorded phase are in [raw.json](raw.json).
