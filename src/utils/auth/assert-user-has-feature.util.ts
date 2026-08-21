import { IUserContext } from '@loomcore/common/models';
import { UnauthorizedError } from '../../errors/index.js';

export function assertUserHasFeature(userContext: IUserContext, features: string[], requireAll: boolean = false): void {
  if (features.length === 0) {
    return;
  }
  const missingFeatures = features.filter(feature => !userContext.features.includes(feature));
  if (requireAll) {
    if (missingFeatures.length > 0) {
      throw new UnauthorizedError(missingFeatures);
    }
  } else {
    if (missingFeatures.length === features.length) {
      throw new UnauthorizedError(missingFeatures);
    }
  }
  return;
}