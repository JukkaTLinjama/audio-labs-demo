# Headrest listening demo

Public interactive prototype for comparing a headrest Programme A between Listener A and Listener B in simulated cabin-noise conditions.

## Live demo

Open the repository through GitHub Pages. The single published entry point is `index.html`.

## This release

- Built-in procedural Bach BWV 846 is available immediately.
- Visitors can load Music demo or Voice / narration files locally; files remain in their browser and are not uploaded.
- Cabin-noise choices model 0, 50 and 100 km/h conditions with a one-second transition.
- Listener A / B changes only the monitor route; it does not alter Program A, Scene or Ambient generation.
- Demo VOL starts at −12 dB for a safe first playback.
- Program A bass protection is referenced to Demo VOL 0 dB and starts at −18 dBFS.
- Light / Normal / Heavy adjust the bass-feelness protection response.

## Audio architecture

```text
Program A → bass protection → Listener A / A→B transfer → Demo VOL → output
Scene ───────────────────────────────────────────────┘
Cabin ambient ───────────────────────────────────────┘
```

Program A protection is intentionally before listener transfer and Demo VOL. Scene and cabin ambient remain independent shared layers.

## Files required at runtime

`index.html` imports the JavaScript modules in this repository root. The low-band protection chain also loads `low-band-lookahead-worklet.js` as an AudioWorklet module. Keep these files together when deploying.

## Development convention

`index.html` is the only active published demo file. Update its displayed version inside the HTML when making a release; do not create a new versioned HTML filename for normal iteration.

## Known limitation

The demo requires a browser with Web Audio and AudioWorklet support. A protection fallback for older mobile browsers is still pending; see [TODO.md](TODO.md).
