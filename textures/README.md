# Textures

Optional: put a studio HDRI here as `textures/studio.hdr` to self-host the environment map.

If it's missing, the app tries a Poly Haven studio HDRI from its CDN. If that fails too, it
generates a procedural `RoomEnvironment`. The other surface textures (carbon, brushed metal,
strap ribs, date digits) are generated on canvas at runtime.
