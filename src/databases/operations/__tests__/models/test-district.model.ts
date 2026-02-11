import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { ITestStateModel, testStateSchema } from "./test-state.model.js";

export interface ITestDistrictModel extends IEntity, IAuditable {
    name: string;
    state_id: number;
    state?: ITestStateModel;
}

export const testDistrictSchema = Type.Object({
    name: Type.String(),
    state_id: Type.Number(),
});

export const testDistrictModelSpec = entityUtils.getModelSpec(testDistrictSchema, { isAuditable: true });
