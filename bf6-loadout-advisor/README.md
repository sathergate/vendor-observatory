# BF6 Loadout Advisor

Real-time Battlefield 6 loadout recommendations based on your per-map performance history.

Zero dependencies -- Python 3.8+ with built-in sqlite3.

## Usage

### Log matches

```bash
python bf6.py log --map Orbital --mode Conquest --cls Assault --weapon M5A3 --kills 22 --deaths 8 --win
python bf6.py log --map Hourglass --mode Breakthrough --cls Recon --weapon SWS-10 --kills 15 --deaths 12 --accuracy 34.5
```

### Get recommendations

```bash
python bf6.py recommend Orbital
python bf6.py rec Orbital --mode Conquest
python bf6.py rec Hourglass --min-matches 3
```

### View stats

```bash
python bf6.py stats
python bf6.py history
python bf6.py history --limit 50
```

## How scoring works

Loadouts are ranked by a composite of K/D (40%), win rate, and accuracy, filtered to your chosen map/mode. Only loadouts with enough matches appear (default: 2+).
