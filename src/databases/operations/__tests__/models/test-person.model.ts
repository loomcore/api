import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { testEmailAddressSchema, ITestEmailAddressModel } from "./test-email-address.model.js";
import { ITestPhoneNumberModel, testPhoneNumberSchema } from "./test-phone-number.model.js";
import { ITestSchoolModel, testSchoolSchema } from "./test-school.model.js";

export interface ITestPersonModel extends IEntity, IAuditable {
    firstName: string;
    middleName: string | null;
    lastName: string;
    clientEmailAddresses: ITestEmailAddressModel[];
    clientPhoneNumbers: ITestPhoneNumberModel[];
    school?: ITestSchoolModel;
}

export const testPersonSchema = Type.Object({
    firstName: Type.String(),
    middleName: Type.Optional(Type.String()),
    lastName: Type.String(),
    clientPhoneNumbers: Type.Array(testPhoneNumberSchema),
    clientEmailAddresses: Type.Array(testEmailAddressSchema),
});

export const testPersonModelSpec = entityUtils.getModelSpec(testPersonSchema, { isAuditable: true });
