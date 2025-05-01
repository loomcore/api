import {IAddress} from '@loomcore/common/models';

function getSingleLineAddress(address: IAddress): string {
	// create street from appliedClient.address.streets array
	const street = address.address1;
	let singleLineAddress = `${street}`;
	if (address.address2) {
		singleLineAddress += ` ${address.address2}`;
	}
	if (address.address3) {
		singleLineAddress += ` ${address.address3}`;
	}
	singleLineAddress += `, ${address.city}, ${address.state} ${address.postalCode}`;

	return singleLineAddress;
}

export const addressUtils =  {
	getSingleLineAddress
};
