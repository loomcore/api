import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { TypeboxIsoDate } from "@loomcore/common/validation";
import { Type } from "@sinclair/typebox";

// Mock model for testing
export interface ITestItem extends IEntity, IAuditable {
    name: string;
    value?: number;
    eventDate?: Date;
  }
  
export const TestItemSchema = Type.Object({
  name: Type.String(),
  value: Type.Optional(Type.Number()),
  eventDate: Type.Optional(TypeboxIsoDate())
});

// Create model specs - auditable
export const TestItemSpec = entityUtils.getModelSpec(TestItemSchema, { isAuditable: true });