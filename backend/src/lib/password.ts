import bcrypt from 'bcrypt';

const COST = 12;

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export const bcryptHasher: PasswordHasher = {
  hash(plain) {
    return bcrypt.hash(plain, COST);
  },
  verify(plain, hash) {
    return bcrypt.compare(plain, hash);
  },
};
