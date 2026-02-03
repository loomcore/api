import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { IAgentModel, agentSchema } from "./agent.model.js";
import { IPremiumModel, premiumSchema } from "./premium.model.js";

export interface IPolicyModel extends IEntity, IAuditable {
    client_id: number;
    amount: number;
    frequency: string;
    agents?: IAgentModel[];
    policy_premiums?: IPremiumModel[];
}

export const policySchema = Type.Object({
    client_id: Type.Number(),
    amount: Type.Number(),
    frequency: Type.String(),
    agents: Type.Optional(Type.Array(agentSchema)),
    policy_premiums: Type.Optional(Type.Array(premiumSchema))
});

export const policyModelSpec = entityUtils.getModelSpec(policySchema, { isAuditable: true });
