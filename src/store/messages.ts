import { defineMessages } from "@/i18n";

/** Texts of the stores' own toasts. */
export const storeMessages = defineMessages(
  { saveFailed: (error: string) => `Sauvegarde impossible : ${error}` },
  { saveFailed: (error: string) => `Could not save: ${error}` },
);
