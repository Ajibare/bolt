import { describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import {
  canStart,
  canStop,
  canTransition,
  isTerminal,
  transition,
} from './bot-lifecycle.js';

describe('bot lifecycle transitions', () => {
  it('accepts the documented roadmap flow', () => {
    expect(canTransition('DRAFT', 'STARTING')).toBe(true);
    expect(canTransition('STOPPED', 'STARTING')).toBe(true);
    expect(canTransition('STARTING', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'PAUSED')).toBe(true);
    expect(canTransition('PAUSED', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'STOPPING')).toBe(true);
    expect(canTransition('PAUSED', 'STOPPING')).toBe(true);
    expect(canTransition('STOPPING', 'STOPPED')).toBe(true);
    expect(canTransition('STARTING', 'ERROR')).toBe(true);
    expect(canTransition('RUNNING', 'ERROR')).toBe(true);
    expect(canTransition('STOPPED', 'STOPPING')).toBe(false);
  });

  it('forbids illegal transitions', () => {
    expect(canTransition('ERROR', 'STARTING')).toBe(false);
    expect(canTransition('RUNNING', 'STARTING')).toBe(false);
    expect(canTransition('DRAFT', 'RUNNING')).toBe(false);
    expect(canTransition('STOPPED', 'PAUSED')).toBe(false);
    expect(canTransition('STOPPING', 'RUNNING')).toBe(false);
  });

  it('throws ConflictException on illegal transition', () => {
    expect(() => transition('ERROR', 'STARTING')).toThrow(ConflictException);
    expect(() => transition('RUNNING', 'STARTING')).toThrow(ConflictException);
  });

  it('returns the destination for legal transitions', () => {
    expect(transition('PAUSED', 'RUNNING')).toBe('RUNNING');
    expect(transition('STOPPING', 'STOPPED')).toBe('STOPPED');
  });

  it('canStart only from DRAFT or STOPPED', () => {
    expect(canStart('DRAFT')).toBe(true);
    expect(canStart('STOPPED')).toBe(true);
    expect(canStart('RUNNING')).toBe(false);
    expect(canStart('ERROR')).toBe(false);
    expect(canStart('PAUSED')).toBe(false);
  });

  it('canStop only from active statuses', () => {
    expect(canStop('STARTING')).toBe(true);
    expect(canStop('RUNNING')).toBe(true);
    expect(canStop('PAUSED')).toBe(true);
    expect(canStop('DRAFT')).toBe(false);
    expect(canStop('STOPPED')).toBe(false);
    expect(canStop('ERROR')).toBe(false);
  });

  it('treats ERROR and STOPPED as resting states', () => {
    expect(isTerminal('ERROR')).toBe(true);
    expect(isTerminal('STOPPED')).toBe(true);
    expect(isTerminal('RUNNING')).toBe(false);
  });
});
