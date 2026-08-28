import { type IUser, type IUserContext } from '@loomcore/common/models';
import type { IDatabase } from '../../databases/models/index.js';
import type { UpdateResult } from '../../databases/models/update-result.js';
import { UserService } from '../../services/user.service.js';
import { AppIdType } from '@loomcore/common/types';

export async function changePassword(
  database: IDatabase,
  userContext: IUserContext,
  userId: AppIdType,
  password: string,
  userService: UserService = new UserService(database),
): Promise<UpdateResult> {
  const updates = {
    password: password,
  };
  await userService.partialUpdateById(
    userContext,
    userId,
    updates,
    true,
  );

  return {
    success: true,
    count: 1,
  };
}
