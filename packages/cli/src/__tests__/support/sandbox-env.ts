import { tmpdir } from 'node:os';

/** Node uses USERPROFILE for the home on Windows, and TEMP/TMP for temporary files. */
export function sandboxEnv(home: string, temp = tmpdir()) {
  return { HOME: home, USERPROFILE: home, TMPDIR: temp, TEMP: temp, TMP: temp };
}
