import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { IPersonModel, personSchema } from "./person.model.js";

export interface IAgentModel extends IEntity, IAuditable {
    person_id: number;
    agent_person?: IPersonModel;
}

export const agentSchema = Type.Object({
    person_id: Type.Number(),
    agent_person: Type.Optional(personSchema),
});

export const agentModelSpec = entityUtils.getModelSpec(agentSchema, { isAuditable: true });
