// Una página, tres roles por hash: #face (celu robot), #control (arrancar/parar), #viewer (jurado, default).
import { Role } from '@gaucho/protocol';
import { mountControl } from './control';
import { mountFace } from './face';
import { mountViewer } from './viewer';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

function roleFromUrl(): Role {
  const hash = location.hash.replace(/^#/, '').split(/[/?]/)[0] ?? '';
  const path = location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ?? '';
  const parsed = Role.safeParse(hash || path);
  return parsed.success ? parsed.data : 'viewer';
}

const role = roleFromUrl();

switch (role) {
  case 'face':
    mountFace(app);
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
