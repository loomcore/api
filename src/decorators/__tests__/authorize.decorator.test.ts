import { describe, expect, it } from 'vitest';
import { Authorize } from '../authorize.decorator.js';
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

describe('auth decorator composition', () => {
  it('keeps denyOnImpersonation when it is set on the same @Authorize', () => {
    expect(resolveAuthRequirement(MethodController, MethodController.prototype, 'stacked')).toEqual({
      features: ['admin'],
      requireMetaOrg: false,
      denyOnImpersonation: true,
    });

    expect(resolveAuthRequirement(MethodController, MethodController.prototype, 'denyOnly')).toEqual({
      requireMetaOrg: false,
      denyOnImpersonation: true,
    });
  });

  it('does not set denyOnImpersonation when only @Authorize() is present', () => {
    expect(resolveAuthRequirement(MethodController, MethodController.prototype, 'authOnly')).toEqual({
      requireMetaOrg: false,
    });
  });

  it('keeps class denyOnImpersonation when a method @Authorize replaces features', () => {
    expect(resolveAuthRequirement(ClassStackedController, ClassStackedController.prototype, 'inherited')).toEqual({
      features: ['admin'],
      denyOnImpersonation: true,
    });

    expect(resolveAuthRequirement(ClassStackedController, ClassStackedController.prototype, 'methodOverridesFeatures')).toEqual({
      requireMetaOrg: false,
      denyOnImpersonation: true,
    });
  });

  it('applies class-level admin and meta-org rules to inherited methods with no decorator', () => {
    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'get')).toEqual({
      features: ['admin'],
      requireMetaOrg: true,
    });
  });

  it('lets a method @Authorize replace features, match mode, and requireMetaOrg', () => {
    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'getById')).toEqual({
      features: ['admin'],
      matchMode: 'any',
      requireMetaOrg: false,
    });

    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'reports')).toEqual({
      features: ['reports'],
      matchMode: 'all',
      requireMetaOrg: false,
    });
  });
});
