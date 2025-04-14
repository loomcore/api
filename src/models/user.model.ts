import { TypeboxIsoDate, TypeboxMoney } from '../validation/typebox-extensions.js';
import {IAuditable} from './auditable.model.js';
import {IEntity, EntitySchema} from './entity.model.js';
import {Type} from '@sinclair/typebox';
import {entityUtils} from '../utils/entity.utils.js';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { AuditableSchema } from './auditable.model.js';

export interface IUser extends IAuditable, IEntity {
	email: string;
	firstName?: string;
	lastName?: string;
	displayName?: string;
	password: string;
	roles?: string[];
	_lastLoggedIn?: Date;
	_lastPasswordChange?: Date;
}

export const UserPasswordSchema = Type.Object({
	password: Type.String({
		title: 'Password',
		minLength: 6,
		maxLength: 30
	}),
});

// Create a validator for just the password schema
export const passwordValidator = TypeCompiler.Compile(UserPasswordSchema);

// User-specific properties schema
export const UserSchema = Type.Object({
  email: Type.String({
    title: 'Email',
		format: 'email'
  }),
	firstName: Type.Optional(Type.String({
		title: 'First Name'
	})),
	lastName: Type.Optional(Type.String({
		title: 'Last Name'
	})),
	displayName: Type.Optional(Type.String({
		title: 'Display Name'
	})),
	// Add password using the same type definition from UserPasswordSchema
	password: UserPasswordSchema.properties.password,
	roles: Type.Optional(Type.Array(Type.String({
		title: 'Roles',
		// We are going to allow defining roles in the database - they won't be hard-coded here
	}))),
	_lastLoggedIn: Type.Optional(TypeboxIsoDate({ title: 'Last Login Date' })),
	_lastPasswordChange: Type.Optional(TypeboxIsoDate({ title: 'Last Password Change Date' })),
});

// Create the model spec first
export const UserSpec = entityUtils.getModelSpec(UserSchema, { isAuditable: true }); // I don't think isMultiTenant is being used anywhere - consider removing

// Then create the public schema by omitting the password from the full schema
export const PublicUserSchema = Type.Omit(UserSpec.fullSchema, ['password']);


