import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT_ENV = fileURLToPath(new URL('../../../../.env', import.meta.url));
const API_ENV = fileURLToPath(new URL('../../.env', import.meta.url));

export const ENV_FILE_PATHS = [path.resolve('.env'), API_ENV, ROOT_ENV].filter(
  existsSync,
);

export function loadEnvFile(): void {
  for (const candidate of ENV_FILE_PATHS) {
    dotenv.config({ path: candidate });
  }
}
