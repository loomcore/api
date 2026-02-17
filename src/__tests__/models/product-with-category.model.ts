import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { CategorySpec, ICategory } from "./category.model.js";
import { IProduct, ProductSchema } from "./product.model.js";
import { IAuditable, IEntity } from "@loomcore/common/models";

export interface IProductWithCategory extends IEntity, IAuditable {
    name: string;
    description?: string;
    internalNumber?: string; // a sensitive property
    category: ICategory;
}

export const ProductWithCategorySchema = Type.Object({
    name: Type.String(),
    description: Type.Optional(Type.String()),
    internalNumber: Type.Optional(Type.String()),
    category: CategorySpec.fullSchema,
})

export const ProductWithCategorySpec = entityUtils.getModelSpec(ProductWithCategorySchema, { isAuditable: true });

export const PublicProductWithCategorySchema = Type.Omit(ProductWithCategorySchema, ['internalNumber']);

export const ProductWithCategoryPublicSpec = entityUtils.getModelSpec(PublicProductWithCategorySchema);