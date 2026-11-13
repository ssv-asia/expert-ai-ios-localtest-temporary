import { useEffect, useCallback, useRef } from "react";
import { BehaviorSubject } from "rxjs";
import { usePiClient } from "./context";
import { useObservable } from "./use-observable";
import type { CustomProvider } from "../types";

export type ProvidersMap = Record<string, CustomProvider>;

export interface CustomModelsState {
  providers: ProvidersMap;
  loaded: boolean;
  saving: boolean;
  error: string | null;
}

const INITIAL: CustomModelsState = {
  providers: {},
  loaded: false,
  saving: false,
  error: null,
};

export interface CustomModelsHandle extends CustomModelsState {
  load: () => Promise<void>;
  save: (providers: ProvidersMap) => Promise<void>;
  addProvider: (name: string, provider: CustomProvider) => Promise<void>;
  removeProvider: (name: string) => Promise<void>;
  updateProvider: (name: string, provider: CustomProvider) => Promise<void>;
}

export function useCustomModels(): CustomModelsHandle {
  const { api } = usePiClient();
  const state$ = useRef(new BehaviorSubject<CustomModelsState>(INITIAL));

  const emit = useCallback(
    (patch: Partial<CustomModelsState>) =>
      state$.current.next({ ...state$.current.value, ...patch }),
    [],
  );

  const load = useCallback(async () => {
    try {
      const data = await api.getCustomModels();
      emit({ providers: data.providers ?? {}, loaded: true, error: null });
    } catch {
      emit({ loaded: true, error: "Failed to load custom models" });
    }
  }, [api, emit]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (providers: ProvidersMap) => {
      emit({ saving: true, error: null });
      try {
        await api.saveCustomModels({ providers });
        emit({ providers, saving: false });
      } catch {
        emit({ saving: false, error: "Failed to save custom models" });
      }
    },
    [api, emit],
  );

  const addProvider = useCallback(
    async (name: string, provider: CustomProvider) => {
      const providers = { ...state$.current.value.providers, [name]: provider };
      await save(providers);
    },
    [save],
  );

  const removeProvider = useCallback(
    async (name: string) => {
      const { [name]: _, ...rest } = state$.current.value.providers;
      await save(rest);
    },
    [save],
  );

  const updateProvider = useCallback(
    async (name: string, provider: CustomProvider) => {
      const providers = { ...state$.current.value.providers, [name]: provider };
      await save(providers);
    },
    [save],
  );

  const snapshot = useObservable(state$.current, INITIAL);

  return { ...snapshot, load, save, addProvider, removeProvider, updateProvider };
}
