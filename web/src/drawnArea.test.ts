import { describe, expect, it } from 'vitest';
import { simplifyPolygon } from './drawnArea';

describe('simplifyPolygon', () => {
  it('clamps, closes, and removes repeated vertices', () => {
    expect(simplifyPolygon([[200, 95], [0, 0], [-200, -95], [200, 95]])).toEqual({
      type: 'Polygon', coordinates: [[[180, 90], [0, 0], [-180, -90], [180, 90]]],
    });
  });

  it('reduces a detailed ring to at most 60 vertices and preserves closure', () => {
    const ring: [number, number][] = Array.from({ length: 240 }, (_, i) => [Math.cos(i * Math.PI / 120) * 20, Math.sin(i * Math.PI / 120) * 20]);
    const result = simplifyPolygon([...ring, ring[0]]).coordinates[0];
    expect(result.length).toBeLessThanOrEqual(61);
    expect(result.length).toBeGreaterThan(3);
    expect(result[0]).toEqual(result[result.length - 1]);
  });
});
