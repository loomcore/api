import { IAuditable, IEntity, IModelSpec } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { TypeboxObjectId } from "@loomcore/common/validation";
import { TSchema, Type } from "@sinclair/typebox";

// Create a model spec for validation
export const MongoTestEntitySchema: TSchema = Type.Object({
  _id: TypeboxObjectId(),
  _orgId: Type.Optional(TypeboxObjectId()),
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  isActive: Type.Optional(Type.Boolean()),
  tags: Type.Optional(Type.Array(Type.String())),
  count: Type.Optional(Type.Number())
});


export interface MongoTestEntity extends IEntity, IAuditable {
  name: string;
  description?: string;
  isActive?: boolean;
  tags?: string[];
  count?: number;
}

export const mongoTestEntityModelSpec: IModelSpec = entityUtils.getModelSpec(MongoTestEntitySchema, { isAuditable: true });
