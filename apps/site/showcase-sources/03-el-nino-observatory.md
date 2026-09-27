# [1;38;2;9;105;218mEL NIÑO[0m · THE PACIFIC CHANGES DIRECTION
[38;2;88;96;105mEquatorial observatory · sea-surface temperature anomaly[0m
---
[1mNORMAL YEAR[22m
WEST                                                        EAST
Indonesia                                                Americas
  ☁ ☁       trade winds →→→→→
≈≈≈≈≈≈≈≈≈≈≈≈≈╲______________________________________╱≈≈≈≈≈≈
 [48;2;245;158;11m warm pool [0m      ╲_____ thermocline _____╱       cool ↑
|||
[1;38;2;220;38;38mEL NIÑO YEAR[0m
WEST                                                        EAST
Indonesia                                                Americas
               weakened winds ┄┄┄→
≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈[48;2;245;158;11m warm east [0m
       flatter thermocline ───────────────────────────────
---
```vega-lite
{
  "title": "Niño 3.4 anomaly · °C",
  "data": {"values": [
    {"month":"Jan","value":0.2},
    {"month":"Mar","value":0.4},
    {"month":"May","value":0.8},
    {"month":"Jul","value":1.3},
    {"month":"Sep","value":1.7},
    {"month":"Nov","value":1.9}
  ]},
  "mark": "line",
  "encoding": {
    "x":{"field":"month","type":"ordinal","title":""},
    "y":{"field":"value","type":"quantitative","title":"anomaly","scale":{"domain":[0,2]}}
  }
}
```
|||
## [38;2;220;38;38mCAUSE → SIGNAL → WEATHER[0m

weaker trade winds
        ↓
warm water moves east
        ↓
rainfall follows the heat
        ↓
weather patterns shift worldwide

$$\Delta T = T_{observed} - T_{normal}$$
---
> [1;38;2;245;158;11mAHA[0m · El Niño is not a warm patch. It is a coupled ocean–atmosphere reorganization.
