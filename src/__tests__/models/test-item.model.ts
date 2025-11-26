import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

// Mock model for testing
export interface ITestItem extends IEntity, IAuditable {
    name: string;
    value?: number;
  }
  
export const TestItemSchema = Type.Object({
name: Type.String(),
value: Type.Optional(Type.Number())
});

// Create model specs - auditable
export const TestItemSpec = entityUtils.getModelSpec(TestItemSchema, { isAuditable: true });