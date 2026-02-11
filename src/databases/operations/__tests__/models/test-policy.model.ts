import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { ITestAgentModel, testAgentSchema } from "./test-agent.model.js";
import { ITestPremiumModel, testPremiumSchema } from "./test-premium.model.js";

export interface ITestPolicyModel extends IEntity, IAuditable {
    client_id: number;
    amount: number;
    frequency: string;
    agents?: ITestAgentModel[];
    policy_premiums?: ITestPremiumModel[];
}

export const testPolicySchema = Type.Object({
    client_id: Type.Number(),
    amount: Type.Number(),
    frequency: Type.String(),
    agents: Type.Optional(Type.Array(testAgentSchema)),
    policy_premiums: Type.Optional(Type.Array(testPremiumSchema))
});

export const testPolicyModelSpec = entityUtils.getModelSpec(testPolicySchema, { isAuditable: true });
