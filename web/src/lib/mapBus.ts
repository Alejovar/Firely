/** Small bridge between the TopNav tool and the mounted map. */
const listeners = new Set<() => void>();
export function requestMapDraw() { listeners.forEach((listener) => listener()); }
export function onMapDraw(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
