# TODO

## Next: reliability and calibration

- [ ] Add an AudioWorklet fallback: when bass protection cannot load, continue Program A playback with protection bypassed and show a clear status message.
  - Suggested code comment: `// EN: Keep the public demo playable when AudioWorklet is unavailable; protection becomes a documented bypass.`
- [ ] Test the published URL on current iPhone Safari and Android Chrome: Play/Pause fade, Mute demo, A/B selection, cabin-noise fade, and portrait layout.
- [ ] Measure limiter reduction with Bach and at least one bass-heavy music file at Demo VOL −12 dB and 0 dB.
- [ ] Confirm whether −18 dBFS remains the correct Normal default after those tests.

## UI

- [ ] Make the cabin control panels mobile-first in portrait orientation; avoid overlap between Bass feelness, Cabin noise and listener controls.
- [ ] Add a compact visible status when protection is bypassed or actively reducing.
- [ ] Decide whether public demo needs curated, licensed Music and Voice examples, or only visitor-loaded files.

## Release process

- [ ] Keep `index.html` as the single active release target.
- [ ] After each published change, hard-refresh one desktop and one mobile browser to distinguish GitHub Pages caching from code regressions.
- [ ] Add a short changelog section to README when the public demo reaches a stable testable milestone.
