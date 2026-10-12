import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AppError, errorHandler } from './error-handler.js';

function fakeRes() {
  const res = { statusCode: 0, body: undefined as unknown, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  return res as unknown as Response & { statusCode: number; body: { error: string; details?: string; code?: string } };
}

describe('errorHandler', () => {
  it('includes the machine-readable code when the AppError carries one', () => {
    const res = fakeRes();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    errorHandler(new AppError(409, 'Entry already listed', undefined, 'duplicate'), {} as Request, res, (() => undefined) as NextFunction);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Entry already listed', details: undefined, code: 'duplicate' });
  });
  it('omits code when absent', () => {
    const res = fakeRes();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    errorHandler(new AppError(400, 'bad'), {} as Request, res, (() => undefined) as NextFunction);
    expect(res.body).toEqual({ error: 'bad', details: undefined });
  });
  it('maps body-parser errors (payload too large, malformed JSON) to their HTTP status instead of 500', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tooLarge = Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large', expose: true });
    const res = fakeRes();
    errorHandler(tooLarge, {} as Request, res, (() => undefined) as NextFunction);
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: 'Request body too large', code: 'payload_too_large' });
    const bad = Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed', expose: true });
    const res2 = fakeRes();
    errorHandler(bad, {} as Request, res2, (() => undefined) as NextFunction);
    expect(res2.statusCode).toBe(400);
    expect(res2.body).toEqual({ error: 'Malformed JSON body', code: 'validation' });
  });
});
