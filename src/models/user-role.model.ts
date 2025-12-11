import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { TSchema, Type } from "@sinclair/typebox";

export interface IUserRole extends IEntity, IAuditable {
    userId: string;
    roleId: string;
}

export const UserRoleSchema: TSchema = Type.Object({
    userId: Type.String({ minLength: 1 }),
    roleId: Type.String({ minLength: 1 }),
});

export const UserRoleModelSpec = entityUtils.getModelSpec(UserRoleSchema, { isAuditable: true });