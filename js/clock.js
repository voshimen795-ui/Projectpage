/**
 * clock.js — Real-time watch logic
 * ---------------------------------------------------------------------------
 * Called every frame from the animation loop. Maps the local system time to
 * hand angles (smooth mechanical sweep, not a quartz tick), keeps the big date
 * in sync, and animates the visible movement: gear train, 4 Hz balance wheel
 * (28,800 vph, like the RM 11's calibre) and the swinging winding rotor.
 */
const TAU = Math.PI * 2;

export function updateWatch(parts, now, elapsed, delta) {
  const { hands, animated, date } = parts;

  // --- Live system time -----------------------------------------------------
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  // Negative rotation = clockwise when viewed from the dial (+Z).
  if (hands.second) hands.second.rotation.z = -(seconds / 60) * TAU;
  if (hands.minute) hands.minute.rotation.z = -(minutes / 60) * TAU;
  if (hands.hour) hands.hour.rotation.z = -(hours / 12) * TAU;
  // Totalizer at 6: running 30-minute track.
  if (hands.sub) hands.sub.rotation.z = -((minutes % 30) / 30) * TAU;

  date?.setDay(now.getDate());

  // --- Movement -------------------------------------------------------------
  for (const g of animated.gears) g.object.rotation.z += g.speed * delta;
  if (animated.balance) animated.balance.rotation.z = Math.sin(elapsed * TAU * 4) * 1.6;
  if (animated.rotor) animated.rotor.rotation.z = Math.sin(elapsed * 0.35) * 1.1 + Math.sin(elapsed * 0.9) * 0.2;
}
