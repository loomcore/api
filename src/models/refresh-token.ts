import { IEntity } from "@loomcore/common/models";

export interface IRefreshToken extends IEntity {
	token: string;
	deviceId: string;
	userId: string;
	expiresOn: number;
	created: Date;
	createdBy: string;
};