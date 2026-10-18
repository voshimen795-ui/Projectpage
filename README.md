# RM 11 — Interactive 3D Watch Configurator

An ultra-premium, real-time 3D product configurator for the Richard Mille RM 11, built with
**Three.js r165**, **GSAP 3.12** and **Tailwind CSS**. It's a dark studio stage with live
time, a material customiser, camera presets and an exploded view.

> Concept/demo project. Not affiliated with Richard Mille.

## Run it

The page uses ES modules, so it has to be served over HTTP (opening `file://` won't work):

```bash
npx serve .            # or: python3 -m http.server 8080
# then open http://localhost:3000 (or :8080)
```

There's no build step: Three.js, GSAP and Tailwind come from CDNs via an import map.

## The 3D model

The app loads **`./models/richard_mille_rm11.glb`** first (see [`models/README.md`](models/README.md)).

If that file isn't there, the app **builds a procedural RM 11 replica** instead. It has a tonneau
case in three parts, 12 spline screws, a skeletonised movement with a turning gear train,
a 4 Hz balance and a swinging rotor, an oversized date, pushers, a knurled crown and an
integrated rubber strap. So the experience works out of the box, and every feature behaves
the same on either model.

### GLB mesh naming

On load, the GLB hierarchy is traversed once. Each mesh is filed by role, matched by regex
against its own name, its ancestors' names and its material name (`js/assets.js → MATCHERS`):

| Role | Matched names (examples) | Used for |
| --- | --- | --- |
| Case / bezel / caseback | `case`, `bezel`, `body`, `lug`, `screw`, `caseback` | Case finish swatches, explode |
| Strap | `strap`, `band`, `bracelet`, `rubber` | Strap swatches, explode (±Y) |
| Dial accents / crown ring | `crown`, `ring`, `flange`, `index`, `pusher` | Colour-matched to strap |
| Crystal | `glass`, `crystal`, `sapphire` | Forced to read as sapphire, explode +2.0 Z |
| Hands | `hour`, `minute`, `second`, `hand` | Live system time |
| Movement / dial | `movement`, `gear`, `bridge`, `dial` | Explode (movement stays put) |

The model is centred automatically and scaled to `SCENE.modelHeight`. Hands are wrapped in
pivot groups at the dial centre, so they rotate correctly even when their origin isn't on the
arbor, and they're assumed to point at 12 in the source file. The detected role counts are
logged to the console (`[RM11] GLB mesh roles`). Rename meshes, or extend `MATCHERS`, if
something lands in the wrong group.

## Features

- **Studio rendering**: high-DPI `WebGLRenderer`, `PCFSoftShadowMap`, ACES Filmic at
  exposure 1.2, `#0a0a0c` backdrop with fog, an overhead shadow-casting key light,
  cyan/orange rim spots, a front fill, a shadow-catcher floor and a radial glow pool.
- **HDRI reflections**: `RGBELoader` → PMREM (`./textures/studio.hdr`, then a Poly Haven
  studio HDRI). If neither loads, a procedural `RoomEnvironment` is used.
- **Loader**: `THREE.LoadingManager` drives the "Loading Experience… XX%" screen. GLB byte
  progress is weighted in, and the counter is eased so it never jumps.
- **Camera**: damped `OrbitControls` (`dampingFactor 0.05`, min/max zoom). Auto-rotation
  stops instantly on input and resumes after 2 s idle. The four presets (Front `(0,0,5)`,
  Profile `(4,0,1)`, Caseback `(0,0,-5)`, Mechanism `(2,1.5,2)`) are GSAP flights in
  spherical coordinates, so front → back sweeps around the watch instead of passing through it.
- **Materials**: Carbon/Titanium Black, Rose Gold or Silver/Steel case; Matte Black, Racing
  Red, Electric Yellow or Cyan strap. The flange, crown ring and seconds hand are
  colour-matched to the strap. Colour, roughness, metalness and clearcoat are tweened on
  already-compiled materials (shaders are pre-compiled at boot), so swatch changes don't stutter.
- **Live watch**: hour, minute and second hands follow `new Date()` with a smooth sweep. The
  big date shows today's date, and the movement animates.
- **Exploded view**: a switch animates it fully and a slider scrubs it. Crystal +2.0 Z,
  bezel +1.5 Z, hands, dial and caseback layered, straps outwards, movement stationary.
  Outer parts lift first. Turning it on also moves the camera to a three-quarter angle.
- **UI**: glassmorphism panels (`backdrop-blur-md bg-black/40 border border-white/10`) set in
  Space Grotesk and Inter. Custom swatch rings with glows, view buttons with an animated
  conic "metallic" border, a custom switch and slider, a spec grid, the price, and an Add to
  Cart button that morphs from pill to spinner to a ✓ check, with a cart badge bump.
- **Responsive**: on desktop the drawer sits on the right and the watch is re-centred with
  `setViewOffset`. On phones and tablets it's a compact tabbed bottom sheet, and the camera
  pulls back on narrow screens so the whole case stays in frame. Supports touch orbit and
  pinch. Arrow keys work in the swatch groups, and `prefers-reduced-motion` is respected.

## Code structure

```
index.html              Markup, Tailwind config, import map
css/styles.css          Custom components (swatches, view buttons, switch, slider, cart)
js/config.js            All tunables: paths, views, finishes, strap colours, explode offsets
js/scene.js             1. Scene / renderer / camera / controls / lights / floor
js/assets.js            2. LoadingManager, HDRI, GLB loading, mesh caching by role
js/procedural-watch.js     Procedural RM 11 fallback (same `parts` registry as the GLB)
js/ui.js                3. UI listeners + GSAP tweens (loader, swatches, views, explode, cart)
js/materials.js         4. Material library + swatch logic
js/main.js              Boot sequence + 5. animation loop
js/clock.js                Real-time hands, date, movement animation
js/explode.js              Exploded-view controller
js/textures.js             Procedural canvas textures (carbon, brushed metal, strap, digits)
```

Open the console and use `window.__RM11__` to inspect the stage, parts and controllers.
