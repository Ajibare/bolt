import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

const DEFAULT_ROUNDS = 12;

@Injectable()
export class PasswordService {
  hash(password: string, rounds: number = DEFAULT_ROUNDS): Promise<string> {
    return bcrypt.hash(password, rounds);
  }

  verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
