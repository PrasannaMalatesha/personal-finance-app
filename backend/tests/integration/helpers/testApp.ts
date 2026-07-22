import type { Pool } from 'pg';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { buildContainer } from '../../../src/container';
import logger from '../../../src/logger';

export function buildTestApp(pool: Pool): Express {
  const container = buildContainer(pool, logger, {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET!,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET!,
  });
  return createApp(container);
}

export function findCookie(setCookie: string[] | undefined, name: string): string | undefined {
  return setCookie?.find((c) => c.startsWith(`${name}=`));
}

export async function signupAndGetCookies(
  app: Express,
  overrides: Partial<{ email: string; password: string; baseCurrency: string }> = {},
): Promise<{ accessCookie: string; refreshCookie: string; userId: string }> {
  const body = {
    email: overrides.email ?? `user${Date.now()}${Math.random()}@example.com`,
    password: overrides.password ?? 'password123',
    baseCurrency: overrides.baseCurrency ?? 'USD',
  };
  const res = await request(app).post('/api/v1/auth/signup').send(body);
  if (res.status !== 201) {
    throw new Error(`signupAndGetCookies failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookies = res.headers['set-cookie'] as unknown as string[];
  const accessCookie = findCookie(cookies, 'accessToken')!;
  const refreshCookie = findCookie(cookies, 'refreshToken')!;
  return {
    accessCookie,
    refreshCookie,
    userId: res.body.data.user.id,
  };
}
