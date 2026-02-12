import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { ITestDistrictModel, testDistrictSchema } from "./test-district.model.js";

export interface ITestSchoolModel extends IEntity, IAuditable {
    name: string;
    districtId: number;
    district?: ITestDistrictModel;
}

export const testSchoolSchema = Type.Object({
    name: Type.String(),
    districtId: Type.Number(),
});

export const testSchoolModelSpec = entityUtils.getModelSpec(testSchoolSchema, { isAuditable: true });
