import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from './auth.decorators';
import type { AuthUser } from './auth.types';
import { RolesGuard } from './roles.guard';

const teacher: AuthUser = {
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  role: 'teacher',
};

function createContext(
  user: AuthUser | undefined,
  handler: (...args: unknown[]) => unknown = () => undefined,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows routes with no role requirement', () => {
    expect(guard.canActivate(createContext(undefined))).toBe(true);
  });

  it('allows a user with a required role', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, ['teacher', 'school_admin'], handler);

    expect(guard.canActivate(createContext(teacher, handler))).toBe(true);
  });

  it('denies a user without a required role', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, ['school_admin'], handler);

    expect(() => guard.canActivate(createContext(teacher, handler))).toThrow(ForbiddenException);
  });

  it('denies an unauthenticated request on a role-gated route', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, ['teacher'], handler);

    expect(() => guard.canActivate(createContext(undefined, handler))).toThrow(
      UnauthorizedException,
    );
  });
});
