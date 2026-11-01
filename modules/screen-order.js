export function pickTopScreen(screens, zOf) {
  const list = Array.from(screens || []);
  let top = null;
  let topZ = -Infinity;
  list.forEach((el) => {
    const z = Number(zOf(el)) || 0;
    if (z >= topZ) { top = el; topZ = z; }
  });
  return top;
}
