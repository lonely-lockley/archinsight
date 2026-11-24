# Incremental graph-change scenarios

Generated: 2026-11-24T20:17:43.906Z

Each scenario edits one source in the full 250-service repository after a cold session has been created. Values are medians of 3 independent processes. The baseline has 1016 sources, 7590 elements, 10204 edges, and 3750 projected edges.

![Incremental scenario times](scenario-times.svg)

| Scenario | Median, ms | Support sources | Relinked sources | Final edges | Projected edges | Edge delta | Deployment, ms | Projections, ms | Inspection, ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| relationship-topology | 4051.2 | 1016 | 1 | 10204 | 3750 | +1 / -1 / ~0 | 1484.7 | 258.6 | 1288.5 |
| environment-attribute | 46.3 | 2 | 1 | 10204 | 3750 | +0 / -0 / ~0 | 0.0 | 0.0 | 0.0 |
| environment-projection | 4271.2 | 1016 | 251 | 9954 | 3500 | +0 / -250 / ~0 | 1488.4 | 233.2 | 1295.2 |

The attribute scenario changes only environment metadata. Relationship and projection scenarios change graph topology and therefore use the conservative global invalidation path. Raw trials and every recorded phase are in [raw.json](raw.json).
