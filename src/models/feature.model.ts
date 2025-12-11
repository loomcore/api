import { IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { TSchema, Type } from "@sinclair/typebox";

export interface IFeature extends IEntity {
    name: string;
}

export const FeatureSchema: TSchema = Type.Object({
    name: Type.String({ minLength: 1 }),
});

export const FeatureModelSpec = entityUtils.getModelSpec(FeatureSchema);