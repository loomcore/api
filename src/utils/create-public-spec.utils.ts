import { IModelSpec } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { config } from '../config/index.js';

export function createPublicSpec(spec: IModelSpec): IModelSpec {
  if (config.debug?.showAuditFields) {
    return spec;
  }
  // Rebuild from the domain schema: keep identity only if the source spec is an entity, omit audit fields.
  return entityUtils.getModelSpec(spec.schema, {
    isEntity: spec.isEntity,
  });
}