import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface ITestPremiumModel extends IEntity, IAuditable {
    policy_id: number;
    amount: number;
    date: Date | string;
}

export const testPremiumSchema = Type.Object({
    policy_id: Type.Number(),
    amount: Type.Number(),
    date: Type.Union([Type.Date(), Type.String()])
});

export const testPremiumModelSpec = entityUtils.getModelSpec(testPremiumSchema, { isAuditable: true });
