import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { ITestAgentModel, testAgentSchema } from "./test-agent.model.js";
import { ITestPremiumModel, testPremiumSchema } from "./test-premium.model.js";

export interface ITestPolicyModel extends IEntity, IAuditable {
    clientId: number;
    amount: number;
    frequency: string;
    agents?: ITestAgentModel[];
    policyPremiums?: ITestPremiumModel[];
}

export const testPolicySchema = Type.Object({
    clientId: Type.Number(),
    amount: Type.Number(),
    frequency: Type.String(),
    agents: Type.Optional(Type.Array(testAgentSchema)),
    policyPremiums: Type.Optional(Type.Array(testPremiumSchema))
});

export const testPolicyModelSpec = entityUtils.getModelSpec(testPolicySchema, { isAuditable: true });
