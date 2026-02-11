import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { testEmailAddressSchema, ITestEmailAddressModel } from "./test-email-address.model.js";
import { ITestPhoneNumberModel, testPhoneNumberSchema } from "./test-phone-number.model.js";
import { ITestSchoolModel, testSchoolSchema } from "./test-school.model.js";

export interface ITestPersonModel extends IEntity, IAuditable {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    client_email_addresses: ITestEmailAddressModel[];
    client_phone_numbers: ITestPhoneNumberModel[];
    school?: ITestSchoolModel;
}

export const testPersonSchema = Type.Object({
    first_name: Type.String(),
    middle_name: Type.Optional(Type.String()),
    last_name: Type.String(),
    client_phone_numbers: Type.Array(testPhoneNumberSchema),
    client_email_addresses: Type.Array(testEmailAddressSchema),
});

export const testPersonModelSpec = entityUtils.getModelSpec(testPersonSchema, { isAuditable: true });
