
import { IPersonModel, personSchema } from "./person.model.js";
import { IAgentModel, agentSchema } from "./agent.model.js";
import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface IClientReportsModel extends IEntity, IAuditable {
    client_person: IPersonModel;
    agent?: IAgentModel;
}

export const clientReportsSchema = Type.Object({
    client_person: personSchema,
    agent: Type.Optional(agentSchema)
});

export const clientReportsModelSpec =
    entityUtils.getModelSpec(clientReportsSchema, { isAuditable: true });
