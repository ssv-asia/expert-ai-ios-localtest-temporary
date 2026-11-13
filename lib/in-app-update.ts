// Google Play In-App Updates — lets an already-installed user get nudged to
// update without ever leaving the app or manually checking the Play Store.
// "Flexible" mode: downloads the new APK in the background while the user
// keeps using the current version, then a small banner offers to restart into
// it once ready — never blocks/interrupts an active session.
import { Platform } from 'react-native';

export type UpdateReadyListener = () => void;

let client: { addStatusUpdateListener: (cb: (e: { status: number }) => void) => void; checkNeedsUpdate: () => Promise<{ shouldUpdate: boolean }>; startUpdate: (opts: { updateType: number }) => Promise<void>; installUpdate: () => void } | null = null;
let downloadedListenerAttached = false;

function getClient() {
  if (Platform.OS !== 'android') return null;
  if (!client) {
    // Lazy require: this native module has nothing useful to do on iOS/web,
    // and importing it eagerly on every platform is pure waste.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const InAppUpdates = require('sp-react-native-in-app-updates').default;
    client = new InAppUpdates();
  }
  return client;
}

/** Checks the Play Store for a newer version and, if one exists, silently
 *  starts a background (flexible) download. Call `onUpdateReady` to be told
 *  when the download finishes and a restart-to-apply banner should show.
 *  Fully silent on any failure (offline, Play Services unavailable, dev
 *  build outside the Store, etc.) — this must never surface as an error. */
export async function checkForFlexibleUpdate(onUpdateReady: UpdateReadyListener): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IAUUpdateKind, IAUInstallStatus } = require('sp-react-native-in-app-updates');
    if (!downloadedListenerAttached) {
      downloadedListenerAttached = true;
      c.addStatusUpdateListener((event: { status: number }) => {
        if (event.status === IAUInstallStatus.DOWNLOADED) onUpdateReady();
      });
    }
    const result = await c.checkNeedsUpdate();
    if (result.shouldUpdate) {
      await c.startUpdate({ updateType: IAUUpdateKind.FLEXIBLE });
    }
  } catch {
    // Best-effort only — a failed update check is never user-visible.
  }
}

/** Installs the already-downloaded update (restarts the app into it). Only
 *  meaningful after onUpdateReady has fired. */
export function installDownloadedUpdate(): void {
  try {
    getClient()?.installUpdate();
  } catch {
    /* best-effort */
  }
}
