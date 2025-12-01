import { IAuditable, IEntity, IModelSpec } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { TSchema, Type } from "@sinclair/typebox";

// Create a model spec for validation
export const TestEntitySchema: TSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  isActive: Type.Optional(Type.Boolean()),
  tags: Type.Optional(Type.Array(Type.String())),
  count: Type.Optional(Type.Number())
});


export interface TestEntity extends IEntity, IAuditable {
  name: string;
  description?: string;
  isActive?: boolean;
  tags?: string[];
  count?: number;
}

export const testModelSpec: IModelSpec = entityUtils.getModelSpec(TestEntitySchema, { isAuditable: true });
