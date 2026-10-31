import test from 'node:test';
import assert from 'node:assert/strict';
import { toLocal, toGeo, footprint, polygonArea, inPolygon, screenToGeo, geoToScreen, polygonContainsPolygon, isSimplePolygon, overlaySVG } from '../dist/parcel.js';

const anchor = { lat: 1.2966, lng: 103.7764 };
const near = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `Expected ${actual} to be within ${tolerance} of ${expected}`,
);
const pointNear = (actual, expected, tolerance = 1e-8) => {
  for (const key of Object.keys(expected)) near(actual[key], expected[key], tolerance);
};

test('Singapore geography uses metres east and metres south with stable roundtrips', () => {
  pointNear(toLocal(anchor, anchor), { x: 0, z: 0 });
  const north = toLocal({ lat: anchor.lat + 0.001, lng: anchor.lng }, anchor);
  near(north.x, 0);
  near(north.z, -111.32, 1e-7);
  const east = toLocal({ lat: anchor.lat, lng: anchor.lng + 0.001 }, anchor);
  assert.ok(east.x > 111 && east.x < 111.32);
  near(east.z, 0);
  for (const geo of [anchor, { lat: 1.3, lng: 103.78 }, { lat: 1.288, lng: 103.765 }]) {
    pointNear(toGeo(toLocal(geo, anchor), anchor), geo, 1e-10);
  }
  for (const local of [{ x: 110, z: -42 }, { x: -500, z: 300 }]) {
    pointNear(toLocal(toGeo(local, anchor), anchor), local, 2e-8);
  }
});

test('footprint preserves its real dimensions, rotation and translated centre', () => {
  const unrotated = footprint({ x: 10, z: -4, rotation: 0 });
  const expected0 = [{ x: -9, z: -17 }, { x: 29, z: -17 }, { x: 29, z: 9 }, { x: -9, z: 9 }];
  unrotated.forEach((point, i) => pointNear(point, expected0[i]));
  const quarterTurn = footprint({ x: 10, z: -4, rotation: 90 });
  const expected90 = [{ x: 23, z: -23 }, { x: 23, z: 15 }, { x: -3, z: 15 }, { x: -3, z: -23 }];
  quarterTurn.forEach((point, i) => pointNear(point, expected90[i]));
  for (const rotation of [0, 37, 90, 180, 270]) {
    const points = footprint({ x: 125, z: -75, rotation }, 40, 20);
    near(polygonArea(points), 800);
    near(points.reduce((sum, p) => sum + p.x, 0) / 4, 125);
    near(points.reduce((sum, p) => sum + p.z, 0) / 4, -75);
  }
});

test('parcel area is winding-independent and placement detects a moved footprint outside', () => {
  const parcel = [{ x: -30, z: -20 }, { x: 30, z: -20 }, { x: 30, z: 20 }, { x: -30, z: 20 }];
  near(polygonArea(parcel), 2400);
  near(polygonArea([...parcel].reverse()), 2400);
  assert.equal(polygonArea(parcel.slice(0, 2)), 0);
  assert.equal(inPolygon({ x: 0, z: 0 }, parcel), true);
  assert.equal(inPolygon({ x: 31, z: 0 }, parcel), false);
  assert.ok(footprint({ x: 0, z: 0, rotation: 0 }).every((p) => inPolygon(p, parcel)));
  assert.ok(footprint({ x: 20, z: 0, rotation: 0 }).some((p) => !inPolygon(p, parcel)));
});

test('concave parcels exclude the recess rather than treating the bounding box as a site', () => {
  const lShape = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 8 }, { x: 8, z: 8 }, { x: 8, z: 20 }, { x: 0, z: 20 }];
  near(polygonArea(lShape), 256);
  assert.equal(inPolygon({ x: 15, z: 4 }, lShape), true);
  assert.equal(inPolygon({ x: 4, z: 15 }, lShape), true);
  assert.equal(inPolygon({ x: 15, z: 15 }, lShape), false);
});

test('map projection inverts intrinsic and resized map coordinates at explicit zooms', () => {
  for (const zoom of [17, 19]) {
    pointNear(geoToScreen(anchor, anchor, zoom), { x: 320, y: 260 }, 1e-6);
    for (const [width, height] of [[640, 520], [320, 260], [960, 360]]) {
      for (const [intrinsicX, intrinsicY] of [[20, 30], [320, 260], [603, 481]]) {
        const geo = screenToGeo(intrinsicX / 640 * width, intrinsicY / 520 * height, width, height, anchor, zoom);
        pointNear(geoToScreen(geo, anchor, zoom), { x: intrinsicX, y: intrinsicY }, 1e-6);
      }
    }
    for (const geo of [{ lat: anchor.lat + 0.0001, lng: anchor.lng + 0.0002 }, { lat: anchor.lat - 0.0001, lng: anchor.lng - 0.0002 }]) {
      const pixel = geoToScreen(geo, anchor, zoom);
      pointNear(screenToGeo(pixel.x, pixel.y, 640, 520, anchor, zoom), geo, 1e-10);
    }
  }
  assert.ok(geoToScreen({ lat: anchor.lat + 0.0001, lng: anchor.lng }, anchor, 19).y < 260);
  assert.ok(geoToScreen({ lat: anchor.lat, lng: anchor.lng + 0.0001 }, anchor, 19).x > 320);
});

test('default map zoom matches the zoom 19 site image and remains invertible', () => {
  const point = { lat: anchor.lat + 0.0002, lng: anchor.lng - 0.00015 };
  pointNear(geoToScreen(point, anchor), geoToScreen(point, anchor, 19), 1e-8);
  pointNear(screenToGeo(80, 120, 640, 520, anchor), screenToGeo(80, 120, 640, 520, anchor, 19), 1e-10);
  const pixel = geoToScreen(point, anchor);
  pointNear(screenToGeo(pixel.x, pixel.y, 640, 520, anchor), point, 1e-10);
});

test('full containment rejects a concave recess even when all footprint corners are inside', () => {
  const uShape = [{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:7,z:10},{x:7,z:3},{x:3,z:3},{x:3,z:10},{x:0,z:10}];
  const bridge = [{x:1,z:1},{x:9,z:1},{x:9,z:8},{x:1,z:8}];
  assert.equal(isSimplePolygon(uShape), true);
  assert.ok(bridge.every(p => inPolygon(p, uShape)), 'This is the counterexample to corner-only containment');
  assert.equal(polygonContainsPolygon(bridge, uShape), false);
  assert.equal(polygonContainsPolygon([...bridge].reverse(), [...uShape].reverse()), false);
  const fits = [{x:0.5,z:1},{x:2.5,z:1},{x:2.5,z:9},{x:0.5,z:9}];
  assert.equal(polygonContainsPolygon(fits, uShape), true);
  const svg = overlaySVG(uShape.map(p=>toGeo(p,anchor)), {x:5,z:4.5,rotation:0}, anchor, anchor, {x:8,z:7});
  assert.ok(svg.includes('fill="#c6634dc0"'), 'The overlay marks the concave crossing outside');
});

test('containment accepts shared boundaries with metre tolerance but rejects a real overhang', () => {
  const square = [{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}];
  assert.equal(polygonContainsPolygon(square, square), true);
  const touching = [{x:0,z:0},{x:5,z:0},{x:5,z:5},{x:0,z:5}];
  assert.equal(polygonContainsPolygon(touching, square), true);
  assert.equal(inPolygon({x:-5e-8,z:5}, square), true);
  const nearBoundary = touching.map(p=>({x:p.x-5e-8,z:p.z}));
  assert.equal(polygonContainsPolygon(nearBoundary, square), true);
  const overhang = touching.map(p=>({x:p.x-0.01,z:p.z}));
  assert.equal(polygonContainsPolygon(overhang, square), false);
});

test('edge tangencies cannot hide an outside segment between two concave vertices', () => {
  const notch = [{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:6,z:10},{x:5,z:5},{x:4,z:10},{x:0,z:10}];
  const touchingAcrossNotch = [{x:1,z:2},{x:9,z:2},{x:9,z:10},{x:1,z:10}];
  assert.ok(touchingAcrossNotch.every(p=>inPolygon(p,notch)));
  assert.equal(polygonContainsPolygon(touchingAcrossNotch,notch), false);
});

test('simple polygons reject bow ties, zero area, duplicate vertices and retraced edges', () => {
  const bowTie = [{x:0,z:0},{x:10,z:10},{x:0,z:10},{x:10,z:0}];
  assert.equal(isSimplePolygon(bowTie), false);
  assert.equal(isSimplePolygon([{x:0,z:0},{x:5,z:0},{x:10,z:0}]), false);
  assert.equal(isSimplePolygon([{x:0,z:0},{x:10,z:0},{x:10,z:0},{x:0,z:10}]), false);
  assert.equal(isSimplePolygon([{x:0,z:0},{x:10,z:0},{x:5,z:0},{x:10,z:10},{x:0,z:10}]), false);
  assert.equal(isSimplePolygon([{x:0,z:0},{x:5,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}]), true);
  assert.equal(isSimplePolygon([{x:0,z:0},{x:NaN,z:1},{x:2,z:2}]), false);
  assert.equal(polygonContainsPolygon(bowTie, [{x:-1,z:-1},{x:11,z:-1},{x:11,z:11},{x:-1,z:11}]), false);
});
