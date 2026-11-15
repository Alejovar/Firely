import { describe, expect, it } from 'vitest';
import { hotspotPeriod, areaGeometry, geometryBbox } from './mapVisual';
describe('map periods and geometry', () => {
  it('uses the selected calendar month within the allowed range', () => expect(hotspotPeriod({year: 2021, month: 2}, '2021-02-10', '2021-12-31')).toEqual(['2021-02-10', '2021-02-28']));
  it('closes the point radius and computes its bounds', () => {
    const geometry = areaGeometry({kind:'point',label:'test',area:{lat:25,lon:-100,radius_km:20}});
    expect(geometry?.type).toBe('Polygon');
    expect(geometryBbox(geometry)?.[0]).toBeLessThan(-100);
  });
});
