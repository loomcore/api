
import { IPersonModel, personSchema } from "./person.model.js";
import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface IClientReportsModel extends IEntity, IAuditable {
    person: IPersonModel;
}

export const clientReportsSchema = Type.Object({
    person: personSchema
});

export const clientReportsModelSpec =
    entityUtils.getModelSpec(clientReportsSchema, { isAuditable: true });
