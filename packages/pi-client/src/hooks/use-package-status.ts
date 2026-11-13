import { useEffect, useCallback, useRef } from "react";
import { BehaviorSubject } from "rxjs";
import { usePiClient } from "./context";
import { useObservable } from "./use-observable";
import type { PackageStatus } from "../types";

export interface PackageStatusState {
  pkg: PackageStatus | null;
  loading: boolean;
  updating: boolean;
  error: string | null;
  success: string | null;
}

const INITIAL: PackageStatusState = {
  pkg: null,
  loading: true,
  updating: false,
  error: null,
  success: null,
};

export interface PackageStatusHandle extends PackageStatusState {
  refresh: () => void;
  update: () => Promise<void>;
  install: () => Promise<void>;
}

export function usePackageStatus(): PackageStatusHandle {
  const { api } = usePiClient();
  const state$ = useRef(new BehaviorSubject<PackageStatusState>(INITIAL));

  const emit = useCallback(
    (patch: Partial<PackageStatusState>) =>
      state$.current.next({ ...state$.current.value, ...patch }),
    [],
  );

  const fetchStatus = useCallback(async () => {
    emit({ loading: true, error: null });
    try {
      const pkg = await api.packageStatus();
      emit({ pkg, loading: false });
    } catch {
      emit({ loading: false, error: "Could not fetch package status" });
    }
  }, [api, emit]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const refresh = useCallback(() => fetchStatus(), [fetchStatus]);

  const update = useCallback(async () => {
    emit({ updating: true, error: null, success: null });
    try {
      await api.packageUpdate();
      emit({ updating: false, success: "Pi agent updated successfully" });
      await fetchStatus();
    } catch {
      emit({ updating: false, error: "Update failed. Check server logs for details." });
    }
  }, [api, emit, fetchStatus]);

  const install = useCallback(async () => {
    emit({ updating: true, error: null, success: null });
    try {
      await api.packageInstall();
      emit({ updating: false, success: "Pi agent installed successfully" });
      await fetchStatus();
    } catch {
      emit({ updating: false, error: "Install failed. Check server logs for details." });
    }
  }, [api, emit, fetchStatus]);

  const snapshot = useObservable(state$.current, INITIAL);

  return { ...snapshot, refresh, update, install };
}
