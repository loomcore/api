import { IEntity } from "@loomcore/common/models";
import type { AppId } from "@loomcore/common/types";
import { entityUtils } from "@loomcore/common/utils";
import { TypeboxIsoDate, getIdSchema } from "@loomcore/common/validation";
import { Type } from "@sinclair/typebox";

export interface IRefreshToken extends IEntity {
	token: string;
	deviceId: string;
	userId: AppId;
	expiresOn: number;
	created: Date;
	createdBy: AppId;
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