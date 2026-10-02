import { describe, expect, it } from 'vitest';
import {
  Authorize,
} from '../authorize.decorator.js';
import { DenyOnImpersonation } from '../deny-on-impersonation.decorator.js';
import { resolveAuthRequirement } from '../resolve-auth-requirement.util.js';

class MethodStackedController {
  @DenyOnImpersonation()
  @Authorize('admin')
  stacked() { }

  @Authorize()
  @DenyOnImpersonation()
  stackedReverse() { }

  @Authorize()
  authOnly() { }
}

@DenyOnImpersonation()
@Authorize('admin')
class ClassStackedController {
  @Authorize()
  methodOverridesFeatures() { }

  inherited() { }
}

class BaseController {
  get() { }
}

@Authorize('admin', { requireMetaOrg: true })
class MetaOrgController extends BaseController {
  @Authorize('admin')
  getById() { }

  @Authorize('reports', { all: true })
  reports() { }
}

describe('auth decorator composition', () => {
  it('combines @DenyOnImpersonation with @Authorize regardless of order', () => {
    expect(resolveAuthRequirement(MethodStackedController, MethodStackedController.prototype, 'stacked')).toEqual({
      requiredFeatures: ['admin'],
      matchMode: 'any',
      requireMetaOrg: false,
      denyOnImpersonation: true,
    });

    expect(resolveAuthRequirement(MethodStackedController, MethodStackedController.prototype, 'stackedReverse')).toEqual({
      requiredFeatures: [],
      matchMode: 'any',
      requireMetaOrg: false,
      denyOnImpersonation: true,
    });
  });

  it('does not set denyOnImpersonation when only @Authorize is present', () => {
    expect(resolveAuthRequirement(MethodStackedController, MethodStackedController.prototype, 'authOnly')).toEqual({
      requiredFeatures: [],
      matchMode: 'any',
      requireMetaOrg: false,
    });
  });

  it('applies class-level @DenyOnImpersonation even when method-level @Authorize overrides features', () => {
    expect(resolveAuthRequirement(ClassStackedController, ClassStackedController.prototype, 'inherited')).toEqual({
      requiredFeatures: ['admin'],
      matchMode: 'any',
      requireMetaOrg: false,
      denyOnImpersonation: true,
    });

    expect(resolveAuthRequirement(ClassStackedController, ClassStackedController.prototype, 'methodOverridesFeatures')).toEqual({
      requiredFeatures: [],
      matchMode: 'any',
      requireMetaOrg: false,
      denyOnImpersonation: true,
    });
  });

  it('applies class-level admin and meta-org rules to inherited methods with no decorator', () => {
    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'get')).toEqual({
      requiredFeatures: ['admin'],
      matchMode: 'any',
      requireMetaOrg: true,
    });
  });

  it('lets a method @Authorize replace features, match mode, and requireMetaOrg', () => {
    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'getById')).toEqual({
      requiredFeatures: ['admin'],
      matchMode: 'any',
      requireMetaOrg: false,
    });

    expect(resolveAuthRequirement(MetaOrgController, MetaOrgController.prototype, 'reports')).toEqual({
      requiredFeatures: ['reports'],
      matchMode: 'all',
      requireMetaOrg: false,
    });
  });
});
