[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zal-m10/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zal-m10/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that still record no token and are not a wrapped or staked product of one that trades, and ranks them by what their launch would be worth.

The dashboard shows the board, a detail view for each protocol, and the steps to farm it.

## How it works

`main.ts` (Node 22, stdlib only) reads `input/snapshot.json`, fits a comps value model from the protocols whose tokens already trade, estimates token odds from peer records, validates the model held-out, and writes `board.json` plus the dashboard data. The dashboard is a static page that renders with no network.

## Build

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```
