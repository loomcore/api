
import { IPersonModel, personSchema } from "./person.model.js";
import { IAgentModel, agentSchema } from "./agent.model.js";
import { IPolicyModel, policySchema } from "./policy.model.js";
import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface IClientReportsModel extends IEntity, IAuditable {
    client_person: IPersonModel;
    agent?: IAgentModel;
    client_policies?: IPolicyModel[];
}

export const clientReportsSchema = Type.Object({
    client_person: personSchema,
    agent: Type.Optional(agentSchema),
    client_policies: Type.Optional(Type.Array(policySchema))
});

export const clientReportsModelSpec =
    entityUtils.getModelSpec(clientReportsSchema, { isAuditable: true });
