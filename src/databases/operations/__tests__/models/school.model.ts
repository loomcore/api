import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { IDistrictModel, districtSchema } from "./district.model.js";

export interface ISchoolModel extends IEntity, IAuditable {
    name: string;
    district_id: number;
    district?: IDistrictModel;
}

export const schoolSchema = Type.Object({
    name: Type.String(),
    district_id: Type.Number(),
});

export const schoolModelSpec = entityUtils.getModelSpec(schoolSchema, { isAuditable: true });
