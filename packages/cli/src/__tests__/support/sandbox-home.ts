import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every test file gets its own HOME, so os.homedir() in-process and every spawned child that inherits
// process.env land in a sandbox instead of the developer's real ~/.frontx (namespace mutex, inventory).
// shortcut: the directory is left in the OS temp dir rather than removed recursively; add cleanup if it piles up.
const realHome = os.homedir();
const sandboxHome = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'frontx-test-home-'));
if (sandboxHome === realHome || sandboxHome.startsWith(realHome + path.sep)) {
  throw new Error(`sandbox HOME ${sandboxHome} is inside the real HOME ${realHome}`);
}
process.env.HOME = sandboxHome;
if (os.homedir() !== sandboxHome) throw new Error(`os.homedir() did not follow HOME: ${os.homedir()}`);
