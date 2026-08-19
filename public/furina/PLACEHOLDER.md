# Furina assets

PNG portraits are live:

| Path | Role |
|------|------|
| `avatar-full.png` | Idle / roulette default (calm mood body) |
| `avatar.png` | Default face (synced from horny crop) |
| `shop-avatar.png` | Shop portrait (bikini set) |
| `mood/<mood>.png` | Face crops for speech / verdict |
| `mood/full/<mood>.png` | Full-body mood art |

Mood ids: `sweet` `calm` `bored` `cruel` `chaotic` `horny`.

Regenerate face crops after replacing full-body art:

```bash
python scripts/crop-furina-mood-faces.py
```

Optional later: `emoji/*.png` (currently falls back to Hu Tao stickers).
