import { formatTime } from './scene-time';

describe('formatTime', () => {
  it('formats zero', () => expect(formatTime(0)).toBe('00:00.000'));
  it('formats minutes, seconds and millis', () => expect(formatTime(65432)).toBe('01:05.432'));
  it('clamps negatives to zero', () => expect(formatTime(-50)).toBe('00:00.000'));
});
