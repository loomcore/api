import { IEntity } from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import { entityUtils } from "@loomcore/common/utils";
import { TypeboxIsoDate, getIdSchema } from "@loomcore/common/validation";
import { Type } from "@sinclair/typebox";

export interface IRefreshToken extends IEntity {
	token: string;
	deviceId: string;
	userId: AppIdType;
	expiresOn: number;
	created: Date;
	createdBy: AppIdType;
};

export const refreshTokenSchema = Type.Object({
    token: Type.String({ minLength: 1 }),
    deviceId: Type.String({ minLength: 1 }),
    userId: getIdSchema(),
    expiresOn: Type.Number(),
    created: TypeboxIsoDate({ title: 'Created Date' }),
    createdBy: getIdSchema()
  });
  
export const refreshTokenModelSpec = entityUtils.getModelSpec(refreshTokenSchema);