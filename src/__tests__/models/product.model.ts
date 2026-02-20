import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { TypeboxObjectId } from "@loomcore/common/validation";
import { ICategory } from "./category.model.js";
import { AppIdType } from "@loomcore/common/types";

export interface IProduct extends IEntity, IAuditable {
    name: string;
    description?: string;
    internalNumber?: string; // a sensitive property
    categoryId: AppIdType;
}

export const ProductSchema = Type.Object({
    name: Type.String(),
    description: Type.Optional(Type.String()),
    internalNumber: Type.Optional(Type.String()),
    categoryId: Type.Union([Type.String({ title: 'Category ID' }), Type.Number({ title: 'Category ID' })]),
})

export const ProductSpec = entityUtils.getModelSpec(ProductSchema, { isAuditable: true });

// Create a public schema for products that omits the sensitive internalNumber
export const ProductPublicSchema = Type.Omit(ProductSpec.fullSchema, ['internalNumber']);