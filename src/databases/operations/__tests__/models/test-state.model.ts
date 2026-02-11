import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface ITestStateModel extends IEntity, IAuditable {
    name: string;
}

export const testStateSchema = Type.Object({
    name: Type.String(),
});

export const testStateModelSpec = entityUtils.getModelSpec(testStateSchema, { isAuditable: true });
