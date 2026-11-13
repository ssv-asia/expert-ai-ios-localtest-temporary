class InAppUpdates {
  addStatusUpdateListener() {}
  async checkNeedsUpdate() { return { shouldUpdate: false }; }
  async startUpdate() {}
  installUpdate() {}
}

export const IAUUpdateKind = { FLEXIBLE: 0 };
export const IAUInstallStatus = { DOWNLOADED: 11 };
export default InAppUpdates;
