export interface IUser {
  _id: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
  // ...any other fields
}