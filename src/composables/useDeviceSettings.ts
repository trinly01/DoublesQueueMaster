import { reactive } from 'vue';
import { LocalStorage } from 'quasar';
import { MatchmakingApp } from 'src/services/matchmaking';

// Per-device settings: these are personal preferences (not club-wide) so they
// are stored in LocalStorage only and never pushed to the cloud.  Each admin
// device retains its own value regardless of what other devices set.
export type DeviceSettings = {
  ttsEnabled?: boolean;
  sortBy?: 'matchesPlayed' | 'rating' | 'winRate' | 'wins' | 'losses' | 'name';
  matchesFilterBy?: 'all' | 'in-progress' | 'waiting';
};

const DEVICE_SETTINGS_KEY = 'device_settings';

const loadDeviceSettings = (): DeviceSettings => {
  const stored = LocalStorage.getItem(
    DEVICE_SETTINGS_KEY,
  ) as DeviceSettings | null;
  if (stored) return stored;
  // First run: migrate from AppState so existing users keep their preferences
  const migrated: DeviceSettings = {};
  if (MatchmakingApp.state.ttsEnabled !== undefined)
    migrated.ttsEnabled = MatchmakingApp.state.ttsEnabled;
  if (MatchmakingApp.state.sortBy !== undefined)
    migrated.sortBy = MatchmakingApp.state.sortBy as DeviceSettings['sortBy'];
  if (MatchmakingApp.state.matchesFilterBy !== undefined)
    migrated.matchesFilterBy = MatchmakingApp.state
      .matchesFilterBy as DeviceSettings['matchesFilterBy'];
  LocalStorage.set(DEVICE_SETTINGS_KEY, migrated);
  return migrated;
};

// Module-level singleton reactive — all callers share the same state
const deviceSettings = reactive<DeviceSettings>(loadDeviceSettings());

const saveDeviceSettings = () => {
  LocalStorage.set(DEVICE_SETTINGS_KEY, { ...deviceSettings });
};

// Plain non-reactive getter for non-Vue callers (e.g. announcer.ts)
export const getDeviceSetting = <K extends keyof DeviceSettings>(
  key: K,
): DeviceSettings[K] => {
  return deviceSettings[key];
};

export function useDeviceSettings() {
  return { deviceSettings, saveDeviceSettings };
}
