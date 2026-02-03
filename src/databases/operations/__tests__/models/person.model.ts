import type { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";
import { emailAddressSchema, IEmailAddressModel } from "./email-address.model.js";
import { IPhoneNumberModel, phoneNumberSchema } from "./phone-number.model.js";
import { ISchoolModel, schoolSchema } from "./school.model.js";

export interface IPersonModel extends IEntity, IAuditable {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    client_email_addresses: IEmailAddressModel[];
    client_phone_numbers: IPhoneNumberModel[];
    school?: ISchoolModel;
}

export const personSchema = Type.Object({
    first_name: Type.String(),
    middle_name: Type.Optional(Type.String()),
    last_name: Type.String(),
    client_phone_numbers: Type.Array(phoneNumberSchema),
    client_email_addresses: Type.Array(emailAddressSchema),
});

export const personModelSpec = entityUtils.getModelSpec(personSchema, { isAuditable: true });
