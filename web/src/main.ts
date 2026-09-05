// Una página, roles por hash: #face, #lookout, #control, #viewer (default).
import { Role } from '@gaucho/protocol';
import { mountControl } from './control';
import { mountFace } from './face';
import { mountLookout } from './lookout';
import { mountViewer } from './viewer';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const parsed = Role.safeParse(location.hash.slice(1));
const role: Role = parsed.success ? parsed.data : 'viewer';

switch (role) {
  case 'face':
    mountFace(app);
    break;
  case 'lookout':
    mountLookout(app);
    break;
  case 'control':
    mountControl(app);
    break;
  case 'viewer':
    mountViewer(app);
    break;
  default: {
    const _exhaustive: never = role;
    throw new Error(`unknown role ${String(_exhaustive)}`);
  }
}
