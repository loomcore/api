import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { ITestPersonModel, testPersonSchema } from "./test-person.model.js";

export interface ITestAgentModel extends IEntity, IAuditable {
    person_id: number;
    agent_person?: ITestPersonModel;
}

export const testAgentSchema = Type.Object({
    person_id: Type.Number(),
    agent_person: Type.Optional(testPersonSchema),
});

export const testAgentModelSpec = entityUtils.getModelSpec(testAgentSchema, { isAuditable: true });
