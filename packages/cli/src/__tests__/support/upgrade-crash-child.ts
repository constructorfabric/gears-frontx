// Child process for the real-kill crash tests. Runs the REAL upgrade engine and
// dies with SIGKILL — no catch, no finally, no exit handler runs — at the
// requested point, so what is left on disk is what a hard-killed process
// leaves. Every filesystem mutation it performs is appended to a log first
// (`<kind> <absolute path>`), so the parent can count what a re-run touches.
//
// argv[2] = JSON { root, name, to, log, killAfterRenames?, killAtUnlink?, killAtStateRename? }
import fs from 'node:fs';
import { upgradeToOrigin } from '../../upgrade/flow';
import { realDeps } from './upgrade-world';

interface Config {
  root: string;
  name: string;
  to: string;
  log: string;
  killAfterRenames?: number;
  killAtUnlink?: number;
  killAtStateRename?: boolean;
}

const config = JSON.parse(process.argv[2]) as Config;
const log = (line: string): void => fs.appendFileSync(config.log, `${line}\n`);
const die = (): never => {
  process.kill(process.pid, 'SIGKILL');
  // SIGKILL cannot be handled; spin so nothing past the kill point can run before it lands.
  for (;;);
};

// The state store's temp-then-rename is the real adapter's own `fs.renameSync`;
// patching it here lets the kill land exactly between "temp written" and "renamed".
const realRename = fs.renameSync.bind(fs);
fs.renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
  if (config.killAtStateRename === true && String(to).endsWith('project.json')) {
    log(`state-rename-killed ${String(to)}`);
    die();
  }
  return realRename(from, to);
}) as typeof fs.renameSync;

let renames = 0;
let unlinks = 0;
const deps = realDeps(config.root, {
  onWriteDisk: (p) => log(`write ${p}`),
  onRename: (_from, to) => {
    if (config.killAfterRenames !== undefined && renames >= config.killAfterRenames) {
      log(`rename-killed ${to}`);
      die();
    }
    renames += 1;
    log(`rename ${to}`);
  },
  onUnlink: (p) => {
    unlinks += 1;
    if (config.killAtUnlink !== undefined && unlinks === config.killAtUnlink) {
      log(`unlink-killed ${p}`);
      die();
    }
    log(`unlink ${p}`);
  },
  onStateWrite: (p) => log(`state ${p}`),
});

void (async () => {
  const outcome = await upgradeToOrigin(config.name, config.to, deps);
  log(`done ${JSON.stringify(outcome.ok === true ? { ok: true } : outcome)}`);
  process.exit(0);
})();
