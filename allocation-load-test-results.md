# Allocation Load Test Results

Generated at: 2026-08-21T09:57:41.188Z

| Scenario | Method | Runtime ms | Allocated | Waitlisted | Priority v. | Capacity v. | Gender v. | Pref % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| under-capacity-100 | SORTING | 16.56 | 100 | 0 | 0 | 0 | 0 | 0 |
| under-capacity-100 | OPTIMIZED | 43.56 | 100 | 0 | 0 | 0 | 0 | 0 |
| full-capacity-500 | SORTING | 164.8 | 500 | 0 | 0 | 0 | 0 | 0 |
| full-capacity-500 | OPTIMIZED | 637.13 | 500 | 0 | 0 | 0 | 0 | 0 |
| over-capacity-1000 | SORTING | 417.43 | 750 | 250 | 0 | 0 | 0 | 0 |
| over-capacity-1000 | OPTIMIZED | 1268.03 | 750 | 250 | 0 | 0 | 0 | 0 |
| same-priority-1000 | SORTING | 472.39 | 800 | 200 | 0 | 0 | 0 | 0 |
| same-priority-1000 | OPTIMIZED | 1483 | 800 | 200 | 0 | 0 | 0 | 0 |
| partial-rooms-5000 | SORTING | 9649.07 | 4200 | 800 | 0 | 0 | 0 | 0 |
| partial-rooms-5000 | OPTIMIZED | 38717.21 | 4200 | 800 | 0 | 0 | 0 | 0 |

Expected invariant columns are `0` for priority, capacity, and gender violations.
Sorting is the baseline. Optimized is preferred only when its preference rate improves enough to justify runtime cost.