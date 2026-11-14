import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration, formatMoney, formatNumber, formatTimer, keyLabel, starParts, urgencyOf } from '../../src/ui/format';

describe('ui formatters', () => {
  it('formats baht with locale separators', () => {
    expect(formatMoney(1250, { lang: 'it' })).toBe('฿ 1.250');
    expect(formatMoney(1250, { lang: 'en' })).toBe('฿ 1,250');
    expect(formatMoney(-80, { lang: 'it' })).toBe('−฿ 80');
    expect(formatMoney(450, { signed: true, lang: 'it' })).toBe('+฿ 450');
    expect(formatMoney(0, { signed: true, lang: 'it' })).toBe('฿ 0');
    expect(formatNumber(1234567, 'it')).toBe('1.234.567');
  });
  it('formats the game clock', () => {
    expect(formatClock(14.5)).toBe('14:30');
    expect(formatClock(7)).toBe('07:00');
    expect(formatClock(23.999)).toBe('23:59');
    expect(formatClock(24.25)).toBe('00:15');
  });
  it('formats durations and timers', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(125)).toBe('2 h 05');
    expect(formatTimer(187)).toBe('3:07');
  });
  it('splits ratings into half stars', () => {
    expect(starParts(3.5)).toEqual(['full', 'full', 'full', 'half', 'empty']);
    expect(starParts(4.8)).toEqual(['full', 'full', 'full', 'full', 'full']);
    expect(starParts(0.2)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect(starParts(9)).toHaveLength(5);
  });
  it('labels key codes', () => {
    expect(keyLabel('KeyF')).toBe('F');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel('Tab')).toBe('Tab');
  });
  it('buckets deadline urgency', () => {
    expect(urgencyOf(-5)).toBe('late');
    expect(urgencyOf(30)).toBe('urgent');
    expect(urgencyOf(100)).toBe('soon');
    expect(urgencyOf(600)).toBe('calm');
  });
});
