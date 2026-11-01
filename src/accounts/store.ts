import { createStore, useStore } from "zustand";
import { accountAdd, accountRemove, accountsList, accountUse, type Profile } from "@/ipc/accounts";

interface AccountsState {
  profiles: Profile[];
  active: string | null;
  loaded: boolean;
  /** The Accounts dialog (spec comptes §6). */
  open: boolean;
}

export const accountsStore = createStore<AccountsState>()(() => ({ profiles: [], active: null, loaded: false, open: false }));

export function useAccounts<T>(selector: (state: AccountsState) => T): T {
  return useStore(accountsStore, selector);
}

let loading: Promise<void> | undefined;

/** Reads the profiles once; a terminal about to start waits for it. */
export function loadAccounts(): Promise<void> {
  loading ??= accountsList()
    .then(({ profiles, active }) => accountsStore.setState({ profiles, active, loaded: true }))
    .catch(() => {
      // Without profiles, terminals start with the default account.
      loading = undefined;
      accountsStore.setState({ loaded: true });
    });
  return loading;
}

async function refresh() {
  loading = undefined;
  await loadAccounts();
}

export const profileNamed = (id: string | undefined): Profile | undefined => (id ? accountsStore.getState().profiles.find((p) => p.id === id) : undefined);

export async function addProfile(name: string, configDir: string): Promise<Profile> {
  const profile = await accountAdd(name, configDir);
  await refresh();
  return profile;
}

export async function removeProfile(id: string) {
  await accountRemove(id);
  await refresh();
}

/** « Utiliser »: new Claude agents start with this profile (null: the default one). */
export async function activateProfile(id: string | null) {
  await accountUse(id);
  await refresh();
}

export function openAccounts() {
  accountsStore.setState({ open: true });
  void refresh();
}
