import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sandboxEnv } from './sandbox-env';

const realHome = fs.realpathSync(os.homedir());
const scratch = fs.realpathSync(process.env.FRONTX_TEST_SCRATCH ??
  (process.platform === 'win32' ? process.env.RUNNER_TEMP : undefined) ?? os.tmpdir());
const relative = path.relative(realHome, scratch);
const outsideHome = relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
if (!outsideHome) {
  throw new Error(`Test scratch ${scratch} is inside the real home ${realHome}. Set FRONTX_TEST_SCRATCH to a writable directory outside the user profile.`);
}

// Keep the child's temporary files separate from the profile that owns the namespace lock.
const root = fs.mkdtempSync(path.join(scratch, 'fx-'));
const home = path.join(root, 'home');
const temp = path.join(root, 'tmp');
fs.mkdirSync(home);
fs.mkdirSync(temp);
Object.assign(process.env, sandboxEnv(home, temp));
if (os.homedir() !== home || os.tmpdir() !== temp) throw new Error('Could not isolate the test home and temp directories.');
