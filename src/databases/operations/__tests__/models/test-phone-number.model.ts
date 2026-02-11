import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export interface ITestPhoneNumberModel extends IEntity, IAuditable {
    phone_number: string;
    phone_number_type: string;
    is_default: boolean;
}

export const testPhoneNumberSchema = Type.Object({
    phone_number: Type.String(),
    phone_number_type: Type.String(),
    is_default: Type.Boolean(),
});

export const testPhoneNumberModelSpec = entityUtils.getModelSpec(testPhoneNumberSchema, { isAuditable: true });
