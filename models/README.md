# Models

Put the watch model here as:

```
models/richard_mille_rm11.glb
```

- Use a binary glTF (`.glb`). Draco-compressed files work too (the decoder is loaded from the CDN).
- Orientation: dial facing **+Z**, 12 o'clock towards **+Y**. Scale and position don't
  matter, because the model is centred and fitted automatically.
- Name meshes (or their materials) so they can be matched by role: `case`, `bezel`,
  `caseback`, `strap`, `crown`, `glass`, `hour_hand`, `minute_hand`, `second_hand`,
  `movement`… See the table in the root `README.md`.
- If the file is missing, the configurator builds its procedural RM 11 replica instead.

Make sure you have the rights to any model you use (for example, check the licence on
Sketchfab before downloading).
