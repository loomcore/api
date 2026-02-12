import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface ITestPhoneNumberModel extends IEntity, IAuditable {
    phoneNumber: string;
    phoneNumberType: string;
    isDefault: boolean;
}

export const testPhoneNumberSchema = Type.Object({
    phoneNumber: Type.String(),
    phoneNumberType: Type.String(),
    isDefault: Type.Boolean(),
});

export const testPhoneNumberModelSpec = entityUtils.getModelSpec(testPhoneNumberSchema, { isAuditable: true });
