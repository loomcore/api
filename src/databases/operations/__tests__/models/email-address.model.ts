import { IAuditable, IEntity } from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";


export interface IEmailAddressModel extends IEntity, IAuditable {
    person_id: number;
    email_address: string;
    is_default: boolean;
}

export const emailAddressSchema = Type.Object({
    person_id: Type.Number(),
    email_address: Type.String(),
    is_default: Type.Boolean(),
});

export const emailAddressModelSpec = entityUtils.getModelSpec(emailAddressSchema);