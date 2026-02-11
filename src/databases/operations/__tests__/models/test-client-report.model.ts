
import { ITestPersonModel, testPersonSchema } from "./test-person.model.js";
import { ITestAgentModel, testAgentSchema } from "./test-agent.model.js";
import { ITestPolicyModel, testPolicySchema } from "./test-policy.model.js";
import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface ITestClientReportsModel extends IEntity, IAuditable {
    client_person: ITestPersonModel;
    agent?: ITestAgentModel;
    client_policies?: ITestPolicyModel[];
}

export const testClientReportsSchema = Type.Object({
    client_person: testPersonSchema,
    agent: Type.Optional(testAgentSchema),
    client_policies: Type.Optional(Type.Array(testPolicySchema))
});

export const testClientReportsModelSpec =
    entityUtils.getModelSpec(testClientReportsSchema, { isAuditable: true });
