import { MIN_SCENE_MS, appendScene, layoutScenes, moveScene, newScene, removeScene, resizeScene, sceneAt, scenesEnd, splitScene } from './scene-segments';

describe('scene-segments', () => {
  const make = () => [newScene('a', 10000), newScene('b', 5000), newScene('c', 2000)];

  it('places scenes one after another', () => {
    expect(layoutScenes(make()).map(s => [s.start, s.end])).toEqual([[0, 10000], [10000, 15000], [15000, 17000]]);
    expect(scenesEnd(make())).toBe(17000);
  });

  it('finds the scene at a time, and keeps the last one after the end', () => {
    const sc = make();
    expect(sceneAt(sc, 9999)?.backgroundId).toBe('a');
    expect(sceneAt(sc, 10000)?.backgroundId).toBe('b');
    expect(sceneAt(sc, 99999)?.backgroundId).toBe('c');
    expect(sceneAt([], 5)).toBeUndefined();
  });

  it('appends, moves, resizes and removes', () => {
    let sc = appendScene(make(), newScene('d'));
    expect(sc.map(s => s.backgroundId)).toEqual(['a', 'b', 'c', 'd']);
    sc = moveScene(sc, sc[3].id, 0);
    expect(sc.map(s => s.backgroundId)).toEqual(['d', 'a', 'b', 'c']);
    sc = resizeScene(sc, sc[0].id, 10);
    expect(sc[0].duration).toBe(MIN_SCENE_MS);
    sc = removeScene(sc, sc[0].id);
    expect(sc.map(s => s.backgroundId)).toEqual(['a', 'b', 'c']);
  });

  it('splits a scene in two, but not next to an edge', () => {
    const sc = make();
    expect(splitScene(sc, 4000).map(s => [s.backgroundId, s.duration])).toEqual([['a', 4000], ['a', 6000], ['b', 5000], ['c', 2000]]);
    expect(splitScene(sc, 100).length).toBe(3);
  });
});
