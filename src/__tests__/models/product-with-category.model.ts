import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { CategorySpec, ICategory } from "./category.model.js";
import { IProduct, ProductPublicSchema, ProductSchema } from "./product.model.js";
import { IAuditable, IEntity } from "@loomcore/common/models";

export interface IProductWithCategory extends IProduct, IEntity {
    category: ICategory;
}

export const ProductWithCategorySchema = Type.Intersect([
    ProductSchema,
    Type.Object({
        category: CategorySpec.fullSchema,
    })])

export const ProductWithCategoryPublicSchema = Type.Intersect([
    ProductPublicSchema,
    Type.Object({
        category: CategorySpec.fullSchema,
    })])

export const ProductWithCategorySpec = entityUtils.getModelSpec(ProductWithCategorySchema);

export const ProductWithCategoryPublicSpec = entityUtils.getModelSpec(ProductWithCategoryPublicSchema);