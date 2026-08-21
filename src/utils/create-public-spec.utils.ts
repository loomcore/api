import { IModelSpec } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { config } from '../config/index.js';

export function createPublicSpec(spec: IModelSpec): IModelSpec {
  if (config.debug?.showAuditFields) {
    return spec;
  }
  const publicSpec = entityUtils.getModelSpec(spec.schema, {
    isAuditable: spec.isAuditable,
    isEntity: spec.isEntity,
    addAuditableSchema: false,
  });
  return publicSpec;
}