import { call } from "./invoke";

/** A Claude profile: a name and Claude Code's own folder (`CLAUDE_CONFIG_DIR`), nothing from inside it (spec comptes §2). */
export interface Profile {
  id: string;
  name: string;
  configDir: string;
}

export interface Accounts {
  profiles: Profile[];
  /** The profile new Claude agents start with; null: the default one. */
  active: string | null;
}

export const accountsList = () => call<Accounts>("accounts_list");
export const accountAdd = (name: string, configDir: string) => call<Profile>("account_add", { name, configDir });
export const accountRemove = (id: string) => call<void>("account_remove", { id });
export const accountUse = (id: string | null) => call<void>("account_use", { id });
