import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { ITestPersonModel, testPersonSchema } from "./test-person.model.js";

export interface ITestAgentModel extends IEntity, IAuditable {
    personId: number;
    agentPerson?: ITestPersonModel;
}

export const testAgentSchema = Type.Object({
    personId: Type.Number(),
    agentPerson: Type.Optional(testPersonSchema),
});

export const testAgentModelSpec = entityUtils.getModelSpec(testAgentSchema, { isAuditable: true });
