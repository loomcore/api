import { Type } from "@sinclair/typebox";
import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { TypeboxIsoDate } from "@loomcore/common/validation";

export interface IAuthorization extends IEntity, IAuditable {
    roleId: string;
    featureId: string;
    startDate?: Date;
    endDate?: Date;
    config?: any;
}

export const AuthorizationSchema = Type.Object({
    roleId: Type.String({ minLength: 1, title: 'Role ID' }),
    featureId: Type.String({ minLength: 1, title: 'Feature ID' }),
    startDate: Type.Optional(TypeboxIsoDate({ title: 'Start Date' })),
    endDate: Type.Optional(TypeboxIsoDate({ title: 'End Date' })),
    config: Type.Optional(Type.Any({ title: 'Config' }))
});

export const AuthorizationModelSpec = entityUtils.getModelSpec(AuthorizationSchema, { isAuditable: true });