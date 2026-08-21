import { haversineDistanceKm } from '../../src/integrations/location/haversine.js';

describe('haversineDistanceKm', () => {
  it('returns zero for identical coordinates', () => {
    const seoul = { latitude: 37.5665, longitude: 126.978 };

    expect(haversineDistanceKm(seoul, seoul)).toBe(0);
  });

  it('calculates the approximate distance between Seoul and Busan', () => {
    const seoul = { latitude: 37.5665, longitude: 126.978 };
    const busan = { latitude: 35.1796, longitude: 129.0756 };

    expect(haversineDistanceKm(seoul, busan)).toBeCloseTo(325.1, 0);
  });

  it('calculates one degree of longitude at the equator', () => {
    const origin = { latitude: 0, longitude: 0 };
    const oneDegreeEast = { latitude: 0, longitude: 1 };

    expect(haversineDistanceKm(origin, oneDegreeEast)).toBeCloseTo(111.195, 2);
  });

  it('rejects coordinates outside valid latitude and longitude ranges', () => {
    expect(() =>
      haversineDistanceKm({ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }),
    ).toThrow(RangeError);
  });
});
