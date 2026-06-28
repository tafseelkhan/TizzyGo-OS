// services/LinkedAccountService.ts
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User, { IUser } from "../../models/tizzygo/auths/User";
import LinkedAccount from "../../models/tizzygo/auths/linkedAccounts";

type LinkedAccountRole = "SELLER" | "FWS" | "SHIPPING";

type IUserDocument = IUser & mongoose.Document;

interface ILinkedAccountUserData {
  name: string;
  email?: string;
  phone?: string;
  roles: LinkedAccountRole;
}

interface INewUserCreationData {
  name: string;
  roles: LinkedAccountRole;
  email?: string;
  phone?: string;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
}

interface ILinkedAccountEntry {
  userId: mongoose.Types.ObjectId;
  roles: LinkedAccountRole;
  isPrimary: boolean;
  addedAt: Date;
}

interface ILinkedAccountDocument extends mongoose.Document {
  primaryOwnerId: mongoose.Types.ObjectId;
  accounts: ILinkedAccountEntry[];
}

interface ILinkedAccountSummary {
  userId: mongoose.Types.ObjectId;
  roles: LinkedAccountRole | string;
  name?: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
}

interface ICreateAccountGroupResult {
  success: true;
  linkedAccount: ILinkedAccountDocument;
  message: string;
}

interface IAddLinkedAccountResult {
  success: true;
  linkedAccount: ILinkedAccountDocument;
  newUser: IUser;
  message: string;
}

interface ISwitchAccountResult {
  success: true;
  token: string;
  currentAccount: {
    userId: mongoose.Types.ObjectId;
    roles: string | string[];
    name: string;
    email?: string;
    phone?: string;
  };
  linkedAccounts: ILinkedAccountSummary[];
  message: string;
}

interface IGetLinkedAccountsResult {
  success: true;
  linkedAccounts: ILinkedAccountSummary[];
  primaryOwnerId?: mongoose.Types.ObjectId;
}

interface IRemoveLinkedAccountResult {
  success: true;
  message: string;
}

export class LinkedAccountService {
  /**
   * Create a new account group for first-time user
   */
  static async createAccountGroup(
    userId: string,
    roles: LinkedAccountRole,
  ): Promise<ICreateAccountGroupResult> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId).session(session) as IUserDocument | null;
      if (!user) throw new Error("User not found");

      // Check if user already has a group
      if (user.linkedAccountGroupId) {
        throw new Error("User already has an account group");
      }

      // Create linked account group
      const linkedAccount = new LinkedAccount({
        primaryOwnerId: userId,
        accounts: [
          {
            userId: userId,
            roles: roles,
            isPrimary: true,
            addedAt: new Date(),
          },
        ],
      });

      await linkedAccount.save({ session });

      // Update user with group reference
      user.linkedAccountGroupId = linkedAccount._id;
      await user.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        linkedAccount,
        message: "Account group created successfully",
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Add a linked account to existing group
   */
  static async addLinkedAccount(
    currentUserId: string,
    newUserData: ILinkedAccountUserData,
  ): Promise<IAddLinkedAccountResult> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the current user
      const currentUser = await User.findById(currentUserId).session(session) as IUserDocument | null;
      if (!currentUser) throw new Error("Current user not found");

      // Get their account group
      const linkedAccount = await LinkedAccount.findById(
        currentUser.linkedAccountGroupId,
      ).session(session) as ILinkedAccountDocument | null;

      if (!linkedAccount) {
        throw new Error("Account group not found");
      }

      // Check if role already exists in group
      const existingRole = linkedAccount.accounts.find(
        (a) => a.roles === newUserData.roles,
      );
      if (existingRole) {
        throw new Error(
          `A ${newUserData.roles} account already exists in this group`,
        );
      }

      // Create new user
      const newUserDataRaw: INewUserCreationData = {
        name: newUserData.name,
        roles: newUserData.roles,
      };

      if (newUserData.email) {
        newUserDataRaw.email = newUserData.email;
        newUserDataRaw.isEmailVerified = true;
      }
      if (newUserData.phone) {
        newUserDataRaw.phone = newUserData.phone;
        newUserDataRaw.isPhoneVerified = true;
      }

      const newUser = new User(newUserDataRaw);
      await newUser.save({ session });

      // Add to linked account group
      linkedAccount.accounts.push({
        userId: newUser._id,
        roles: newUserData.roles,
        isPrimary: false,
        addedAt: new Date(),
      });

      await linkedAccount.save({ session });

      // Update new user with group reference
      newUser.linkedAccountGroupId = linkedAccount._id;
      await newUser.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        linkedAccount,
        newUser,
        message: `${newUserData.roles} account added successfully`,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Switch to a different account in the group
   */
  static async switchAccount(
    currentUserId: string,
    targetUserId: string,
  ): Promise<ISwitchAccountResult> {
    try {
      // Get current user
      const currentUser = await User.findById(currentUserId) as IUserDocument | null;
      if (!currentUser) throw new Error("Current user not found");

      // Get their account group
      const linkedAccount = await LinkedAccount.findOne({
        "accounts.userId": currentUserId,
      }) as ILinkedAccountDocument | null;

      if (!linkedAccount) {
        throw new Error("Account group not found");
      }

      // Verify target user is in the same group
      const targetAccount = linkedAccount.accounts.find(
        (a) => a.userId.toString() === targetUserId,
      );

      if (!targetAccount) {
        throw new Error("Target user not found in this account group");
      }

      // Get target user details
      const targetUser = await User.findById(targetUserId) as IUserDocument | null;
      if (!targetUser) throw new Error("Target user not found");

      // Generate JWT for target user
      const token = jwt.sign(
        { userId: targetUser._id, roles: targetUser.roles },
        process.env.JWT_SECRET!,
        { expiresIn: "7d" },
      );

      // Get all accounts in the group
      const allAccounts = await Promise.all(
        linkedAccount.accounts.map(async (acc: ILinkedAccountEntry) => {
          const user = await User.findById(acc.userId) as IUserDocument | null;
          return {
            userId: acc.userId,
            roles: acc.roles,
            name: user?.name,
            email: user?.email,
            phone: user?.phone,
            isPrimary: acc.isPrimary,
          };
        }),
      );

      return {
        success: true,
        token,
        currentAccount: {
          userId: targetUser._id as mongoose.Types.ObjectId,
          roles: targetUser.roles,
          name: targetUser.name,
          email: targetUser.email,
          phone: targetUser.phone,
        },
        linkedAccounts: allAccounts,
        message: `Switched to ${targetUser.roles} account`,
      };
    } catch (error) {
      throw error;
    }
  }

  // services/LinkedAccountService.ts

  /**
   * ✅ Get Random Linked Account for Double Tap
   */
  static async getRandomLinkedAccount(currentUserId: string) {
    try {
      console.log(`🔄 Getting random account for user: ${currentUserId}`);

      // Get current user
      const currentUser = await User.findById(currentUserId) as IUserDocument | null;
      if (!currentUser) {
        throw new Error("Current user not found");
      }

      // Find account group
      let linkedAccount = await LinkedAccount.findOne({
        "accounts.userId": currentUserId,
      }) as ILinkedAccountDocument | null;

      if (!linkedAccount) {
        linkedAccount = await LinkedAccount.findOne({
          primaryOwnerId: currentUserId,
        }) as ILinkedAccountDocument | null;
      }

      if (!linkedAccount) {
        throw new Error("Account group not found");
      }

      // ✅ Get all accounts except current
      const otherAccounts = linkedAccount.accounts.filter(
        (acc) => acc.userId.toString() !== currentUserId.toString()
      );

      if (otherAccounts.length === 0) {
        throw new Error("No other accounts available to switch");
      }

      // ✅ Select random account
      const randomIndex = Math.floor(Math.random() * otherAccounts.length);
      const randomAccount = otherAccounts[randomIndex];

      console.log(`🎯 Random account selected: ${randomAccount.userId}`);

      // Get target user details
      const targetUser = await User.findById(randomAccount.userId) as IUserDocument | null;
      if (!targetUser) {
        throw new Error("Target user not found");
      }

      // ✅ Generate new JWT token for target user
      const token = jwt.sign(
        { 
          userId: targetUser._id,
          roles: targetUser.roles,
          id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email,
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: "7d" },
      );

      // ✅ Get all accounts in the group
      const allAccounts = await Promise.all(
        linkedAccount.accounts.map(async (acc: ILinkedAccountEntry) => {
          const user = await User.findById(acc.userId) as IUserDocument | null;
          return {
            userId: acc.userId,
            roles: acc.roles || user?.roles || 'SELLER',
            name: user?.name || 'Unknown',
            email: user?.email || '',
            phone: user?.phone || '',
            isPrimary: acc.isPrimary || false,
          };
        }),
      );

      return {
        success: true,
        token: token,
        account: {
          userId: targetUser._id,
          roles: targetUser.roles || 'SELLER',
          name: targetUser.name || 'Unknown',
          email: targetUser.email || '',
          phone: targetUser.phone || '',
          isPrimary: randomAccount.isPrimary || false,
        },
        allAccounts: allAccounts,
        message: `Switched to ${targetUser.roles} account: ${targetUser.name}`,
      };
    } catch (error: any) {
      console.error("❌ Service error in getRandomLinkedAccount:", error);
      throw new Error(`Failed to get random account: ${error.message}`);
    }
  }

  /**
   * Get all linked accounts for a user
   */
  static async getLinkedAccounts(userId: string): Promise<IGetLinkedAccountsResult> {
    try {
      const user = await User.findById(userId) as IUserDocument | null;
      if (!user) throw new Error("User not found");

      // Find account group
      let linkedAccount: ILinkedAccountDocument | null = null;

      if (user.linkedAccountGroupId) {
        linkedAccount = await LinkedAccount.findById(user.linkedAccountGroupId) as ILinkedAccountDocument | null;
      } else {
        linkedAccount = await LinkedAccount.findOne({ primaryOwnerId: userId }) as ILinkedAccountDocument | null;
      }

      if (!linkedAccount) {
        return {
          success: true,
          linkedAccounts: [
            {
              userId: user._id as mongoose.Types.ObjectId,
              roles: user.roles,
              name: user.name,
              email: user.email,
              phone: user.phone,
              isPrimary: true,
            },
          ],
        };
      }

      // Get all account details
      const accounts = await Promise.all(
        linkedAccount.accounts.map(async (acc: ILinkedAccountEntry) => {
          const userDetails = await User.findById(acc.userId) as IUserDocument | null;
          return {
            userId: acc.userId,
            roles: acc.roles,
            name: userDetails?.name,
            email: userDetails?.email,
            phone: userDetails?.phone,
            isPrimary: acc.isPrimary,
          };
        }),
      );

      return {
        success: true,
        linkedAccounts: accounts,
        primaryOwnerId: linkedAccount.primaryOwnerId,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remove a linked account from the group
   */
  static async removeLinkedAccount(
    currentUserId: string,
    targetUserId: string,
  ): Promise<IRemoveLinkedAccountResult> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const currentUser = await User.findById(currentUserId).session(session) as IUserDocument | null;
      if (!currentUser) throw new Error("Current user not found");

      const linkedAccount = await LinkedAccount.findOne({
        "accounts.userId": currentUserId,
      }).session(session) as ILinkedAccountDocument | null;

      if (!linkedAccount) {
        throw new Error("Account group not found");
      }

      // Prevent removing primary account
      const targetAccount = linkedAccount.accounts.find(
        (a) => a.userId.toString() === targetUserId,
      );

      if (!targetAccount) {
        throw new Error("Target account not found");
      }

      if (targetAccount.isPrimary) {
        throw new Error("Cannot remove the primary account");
      }

      // Remove from group
      linkedAccount.accounts = linkedAccount.accounts.filter(
        (a) => a.userId.toString() !== targetUserId,
      );

      await linkedAccount.save({ session });

      // Update user to remove group reference
      await User.findByIdAndUpdate(
        targetUserId,
        { linkedAccountGroupId: null },
        { session },
      );

      await session.commitTransaction();

      return {
        success: true,
        message: "Account removed successfully",
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
