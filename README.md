# Kasel Hero

An interactive hero section for a fictional hardware studio, **Kasel**. A blueprint drone sits on a blue drafting grid; move across the drawing to uncover a red 3D product world underneath, tap to unfold it, steer the drone around, and tap again to land it.

- Desktop: move the mouse over the blueprint, click to unfold, move to steer, click to land.
- Touch: drag across the drawing, tap to unfold, drag to steer, tap to land. On small screens the page switches to a phone layout (copy on top, a camera window that follows the drone below).

## Run locally

It is a static site with no build step. Serve the `public/` folder with any static file server, for example:

```
python3 -m http.server 8080 -d public
# or
npx serve public
```

and open http://localhost:8080.

## Structure

```
public/
  index.html         page, styles, import map
  credits.html       fonts, libraries and asset licences
  js/app.js          input, fixed-step clock (1/240 s), layout and framing
  js/sim.js          simulation: state from input, no DOM
  js/blue.js         blueprint layer (Canvas 2D)
  js/red.js          3D product layer (three.js)
  js/ui.js           overlay layer (Canvas 2D)
  js/core.js         clock, seeded PRNG, spring integrators, pointer adapter
  data/              constants for the simulation and the layers
  assets/            drone model and textures
  fonts/             Inter and Inter Tight
  vendor/            three.js (only the parts used), opentype.js
```

Rendering is a pure function of the simulation state, and the simulation runs on a fixed step, so the same input always gives the same frames. `index.html?mode=capture` exposes `window.APP.renderAt(frame)` for frame-exact rendering of a given input log.

## Licences

- Inter and Inter Tight: SIL Open Font License 1.1 (`public/fonts/OFL.txt`).
- three.js: MIT (`public/vendor/three.LICENSE`).
- opentype.js: MIT (`public/vendor/opentype.LICENSE`).
- Drone model, textures and drawings: original assets made for this page.

See `public/credits.html`.
