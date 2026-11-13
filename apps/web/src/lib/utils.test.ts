import { describe, expect, it } from 'vitest';
import {
  amount,
  amountWithSymbol,
  cn,
  isRejection,
  pct,
  requestLabel,
  requestTone,
  shortDate,
  toRaw,
  truncateMiddle,
} from './utils';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false, null, 'b', undefined)).toBe('a b');
  });
});

describe('amount formatting', () => {
  it('formats raw NEAR without floating point loss', () => {
    expect(amount('1000000000000000000000000', 'NEAR')).toBe('1');
    expect(amountWithSymbol('1500000000000000000000000', 'NEAR')).toBe('1.5 NEAR');
  });

  it('formats six-decimal fungible tokens', () => {
    expect(amountWithSymbol('2500000', 'ft:usdc.testnet')).toBe('2.5 USDC');
  });

  it('returns the raw value when it cannot be parsed', () => {
    expect(amount('not-a-number', 'NEAR')).toBe('not-a-number');
  });
});

describe('toRaw', () => {
  it('converts decimals into raw units exactly', () => {
    expect(toRaw('1.5', 24)).toBe('1500000000000000000000000');
    expect(toRaw('0', 6)).toBe('0');
    expect(toRaw('.5', 6)).toBe('500000');
  });

  it('rejects malformed and over-precise input', () => {
    expect(() => toRaw('abc', 24)).toThrow('Enter a number');
    expect(() => toRaw('1.1234567', 6)).toThrow('Max 6 decimal places');
  });
});

describe('request presentation', () => {
  it('maps statuses to tones', () => {
    expect(requestTone('COMPLETED')).toBe('green');
    expect(requestTone('PENDING_APPROVAL')).toBe('amber');
    expect(requestTone('REJECTED')).toBe('red');
    expect(requestTone('AWAITING_EXECUTION')).toBe('blue');
    expect(requestTone('UNKNOWN_STATUS')).toBe('slate');
  });

  it('maps statuses to human labels', () => {
    expect(requestLabel('PENDING_APPROVAL')).toBe('Needs co-sign');
    expect(requestLabel('REJECTED_BY_OWNER')).toBe('Owner rejected');
    expect(requestLabel('SOMETHING_ELSE')).toBe('something else');
  });

  it('classifies rejection states', () => {
    expect(isRejection('REJECTED')).toBe(true);
    expect(isRejection('EXPIRED')).toBe(true);
    expect(isRejection('COMPLETED')).toBe(false);
  });
});

describe('truncateMiddle', () => {
  it('keeps short values and shortens long ones', () => {
    expect(truncateMiddle('abc')).toBe('abc');
    expect(truncateMiddle('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe('0xAAAAAAAA…AAAAAAAA');
    expect(truncateMiddle(null)).toBe('—');
  });
});

describe('pct', () => {
  it('clamps to 0..100 and handles a zero total', () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(9, 4)).toBe(100);
    expect(pct(1, 0)).toBe(0);
  });
});

describe('shortDate', () => {
  it('handles missing values and formats dates', () => {
    expect(shortDate(null)).toBe('—');
    expect(typeof shortDate('2026-01-02T03:04:05.000Z')).toBe('string');
  });
});
