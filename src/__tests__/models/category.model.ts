import { IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface ICategory extends IEntity {
  name: string;
}

export const CategorySchema = Type.Object({
  name: Type.String(),
});

export const CategorySpec = entityUtils.getModelSpec(CategorySchema);

