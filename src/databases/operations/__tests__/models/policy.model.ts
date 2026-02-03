import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { IAgentModel, agentSchema } from "./agent.model.js";

export interface IPolicyModel extends IEntity, IAuditable {
    amount: number;
    frequency: string;
    agents?: IAgentModel[];
}

export const policySchema = Type.Object({
    amount: Type.Number(),
    frequency: Type.String(),
    agents: Type.Optional(Type.Array(agentSchema))
});

export const policyModelSpec = entityUtils.getModelSpec(policySchema, { isAuditable: true });
