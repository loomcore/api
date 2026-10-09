import { describe, expect, it } from 'vitest';
import { authorizeMethod } from '../../utils/auth/authorize-method.util.js';
import { AllowAnonymous } from '../allow-anonymous.decorator.js';
import { Authorize } from '../authorize.decorator.js';
import { resolveAllowAnonymous } from '../resolve-allow-anonymous.util.js';
import { resolveAuthRequirement } from '../resolve-auth-requirement.util.js';

class MethodController {
  @Authorize({ features: ['admin'], denyOnImpersonation: true })
  stacked() { }

  @Authorize({ denyOnImpersonation: true })
  denyOnly() { }

  @Authorize()
  authOnly() { }
}

@Authorize({ features: ['admin'], denyOnImpersonation: true })
class ClassStackedController {
  @Authorize()
  methodOverridesFeatures() { }

  inherited() { }
}

class BaseController {
  get() { }

  getById() { }
}

@Authorize({ features: ['admin'], requireMetaOrg: true })
class MetaOrgController extends BaseController {
  @Authorize('admin')
  override getById() { }

  @Authorize(['reports'], 'all')
  reports() { }
}

@Authorize('admin')
class AuthorizeClass {
  @AllowAnonymous()
  health() { }

  @Authorize('admin')
  @AllowAnonymous()
  both() { }

  locked() { }
}

@AllowAnonymous()
class AnonymousClass {
  @Authorize('admin')
  secure() { }

  open() { }
}

@Authorize('admin')
@AllowAnonymous()
class BothOnClass {
  plain() { }

  @AllowAnonymous()
  health() { }
}

describe('auth decorator composition', () => {
  it('returns the fields set on that @Authorize', () => {
    expect(resolveAuthRequirement(MethodController, MethodController.prototype, 'stacked')).toEqual({
      features: ['admin'],
      denyOnImpersonation: true,
    });

    expect(resolveAuthRequirement(MethodController, MethodController.prototype, 'denyOnly')).toEqual({
      denyOnImpersonation: true,
    });
  });

  it('returns no extra fields when only @Authorize() is present', () => {
    expect(resolveAuthRequirement(MethodController, MethodController.prototype, 'authOnly')).toBeUndefined();
  });

  it('keeps the class requirement on actions with no method decorator', () => {
    expect(resolveAuthRequirement(ClassStackedController, ClassStackedController.prototype, 'inherited')).toEqual({
      features: ['admin'],
      denyOnImpersonation: true,
    });

    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'get')).toEqual({
      features: ['admin'],
      requireMetaOrg: true,
    });
  });

  it('lets a method @Authorize replace the class requirement', () => {
    expect(resolveAuthRequirement(ClassStackedController, ClassStackedController.prototype, 'methodOverridesFeatures')).toBeUndefined();

    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'getById')).toEqual({
      features: ['admin'],
      matchMode: 'any',
    });

    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'reports')).toEqual({
      features: ['reports'],
      matchMode: 'all',
    });
  });

  it('lets a method decorator replace the other decorator on the controller', () => {
    expect(resolveAllowAnonymous(AuthorizeClass, AuthorizeClass.prototype, 'health')).toBe(true);
    expect(resolveAuthRequirement(AuthorizeClass, AuthorizeClass.prototype, 'health')).toBeUndefined();

    expect(resolveAuthRequirement(AnonymousClass, AnonymousClass.prototype, 'secure')).toEqual({
      features: ['admin'],
      matchMode: 'any',
    });
    expect(resolveAllowAnonymous(AnonymousClass, AnonymousClass.prototype, 'secure')).toBeUndefined();

    expect(resolveAllowAnonymous(AnonymousClass, AnonymousClass.prototype, 'open')).toBe(true);
    expect(resolveAuthRequirement(AuthorizeClass, AuthorizeClass.prototype, 'locked')).toEqual({
      features: ['admin'],
      matchMode: 'any',
    });
  });

  it('rejects both decorators only when they are on the same method or the same class', () => {
    expect(() => authorizeMethod(new AuthorizeClass(), 'both')).toThrow(/cannot be used together/);
    expect(() => authorizeMethod(new BothOnClass(), 'plain')).toThrow(/cannot be used together/);
    expect(() => authorizeMethod(new BothOnClass(), 'health')).toThrow(/cannot be used together/);

    expect(() => authorizeMethod(new AuthorizeClass(), 'health')).not.toThrow();
    expect(() => authorizeMethod(new AnonymousClass(), 'secure')).not.toThrow();
  });
});
