import { describe, expect, it } from 'vitest';
import {
  Authorize,
  DenyOnImpersonation,
  resolveAuthRequirement,
} from '../authorize.decorator.js';

class MethodStackedController {
  @DenyOnImpersonation()
  @Authorize('admin')
  stacked() {}

  @Authorize()
  @DenyOnImpersonation()
  stackedReverse() {}

  @Authorize()
  authOnly() {}
}

@DenyOnImpersonation()
@Authorize('admin')
class ClassStackedController {
  @Authorize()
  methodOverridesFeatures() {}

  inherited() {}
}

describe('auth decorator composition', () => {
  it('combines @DenyOnImpersonation with @Authorize regardless of order', () => {
    expect(resolveAuthRequirement(MethodStackedController, MethodStackedController.prototype, 'stacked')).toEqual({
      features: ['admin'],
      mode: 'any',
      denyOnImpersonation: true,
    });

    expect(resolveAuthRequirement(MethodStackedController, MethodStackedController.prototype, 'stackedReverse')).toEqual({
      features: [],
      mode: 'any',
      denyOnImpersonation: true,
    });
  });

  it('does not set denyOnImpersonation when only @Authorize is present', () => {
    expect(resolveAuthRequirement(MethodStackedController, MethodStackedController.prototype, 'authOnly')).toEqual({
      features: [],
      mode: 'any',
    });
  });

  it('applies class-level @DenyOnImpersonation even when method-level @Authorize overrides features', () => {
    expect(resolveAuthRequirement(ClassStackedController, ClassStackedController.prototype, 'inherited')).toEqual({
      features: ['admin'],
      mode: 'any',
      denyOnImpersonation: true,
    });

    expect(resolveAuthRequirement(ClassStackedController, ClassStackedController.prototype, 'methodOverridesFeatures')).toEqual({
      features: [],
      mode: 'any',
      denyOnImpersonation: true,
    });
  });
});
