import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface IPhoneNumberModel extends IEntity, IAuditable {
    phone_number: string;
    phone_number_type: string;
    is_default: boolean;
}

export const phoneNumberSchema = Type.Object({
    phone_number: Type.String(),
    phone_number_type: Type.String(),
    is_default: Type.Boolean(),
});

export const phoneNumberModelSpec = entityUtils.getModelSpec(phoneNumberSchema, { isAuditable: true });