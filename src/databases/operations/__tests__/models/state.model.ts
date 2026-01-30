import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface IStateModel extends IEntity, IAuditable {
    name: string;
}

export const stateSchema = Type.Object({
    name: Type.String(),
});

export const stateModelSpec = entityUtils.getModelSpec(stateSchema, { isAuditable: true });
