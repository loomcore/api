import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { IStateModel, stateSchema } from "./state.model.js";

export interface IDistrictModel extends IEntity, IAuditable {
    name: string;
    state_id: number;
    state?: IStateModel;
}

export const districtSchema = Type.Object({
    name: Type.String(),
    state_id: Type.Number(),
});

export const districtModelSpec = entityUtils.getModelSpec(districtSchema, { isAuditable: true });
