import { IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { TypeboxIsoDate } from "@loomcore/common/validation";
import { Type } from "@sinclair/typebox";

export interface IRefreshToken extends IEntity {
	token: string;
	deviceId: string;
	userId: string;
	expiresOn: number;
	created: Date;
	createdBy: string;
};

export const refreshTokenSchema = Type.Object({
    token: Type.String({ minLength: 1 }),
    deviceId: Type.String({ minLength: 1 }),
    userId: Type.String({ minLength: 1 }),
    expiresOn: Type.Number(),
    created: TypeboxIsoDate({ title: 'Created Date' }),
    createdBy: Type.String({ minLength: 1 })
  });
  
export const refreshTokenModelSpec = entityUtils.getModelSpec(refreshTokenSchema);