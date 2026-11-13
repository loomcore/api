import type { AppIdType } from '@loomcore/common/types';
import type { IUser } from '@loomcore/common/models';
import moment from 'moment';
import type { IDatabase } from '../../databases/models/index.js';
import { createSystemContext } from '../../services/request-context.interface.js';
import { UserService } from '../../services/user.service.js';

export async function updateLastLoggedIn(
  database: IDatabase,
  userId: AppIdType,
  userService: UserService = new UserService(database),
): Promise<void> {
  try {
    const updates: Partial<IUser> = {
      // Validate runs before decode, so dates must be ISO strings at the service boundary
      _lastLoggedIn: moment().utc().toISOString() as unknown as Date,
    };
    await userService.update(
      createSystemContext(),
      { filters: { _id: { eq: userId } } },
      updates,
    );
  } catch (error) {
    console.error(`Error updating lastLoggedIn: ${error}`);
  }
}
