/* Isolated demo project only. Keep outbound proxying; send loopback traffic to
 * local emulators directly. Firebase CLI 15 ignores NO_PROXY in apiv2. */
const {createRequire} = require('node:module');
const firebaseRequire = createRequire(require.resolve('firebase-tools/lib/bin/firebase'));
const undici = firebaseRequire('undici');
const OriginalProxyAgent = undici.ProxyAgent;
undici.ProxyAgent = class EmulatorProxyAgent {
  constructor(options) { this.proxy = new OriginalProxyAgent(options); this.local = new undici.Agent(); }
  dispatch(options, handler) {
    const host = new URL(String(options.origin)).hostname;
    return (['127.0.0.1','localhost','[::1]'].includes(host) ? this.local : this.proxy).dispatch(options, handler);
  }
  close() { return Promise.all([this.local.close(),this.proxy.close()]); }
  destroy(error) { return Promise.all([this.local.destroy(error),this.proxy.destroy(error)]); }
};
const args = ['emulators:exec','--config','firebase.emulator.json','--project','demo-bali-menu','--only','auth,firestore,storage','node scripts/test-firebase.mjs'];
process.argv = [process.argv[0], require.resolve('firebase-tools/lib/bin/firebase'), ...args];
require('firebase-tools/lib/bin/firebase');
