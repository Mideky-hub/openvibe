import { defineMessages } from "@/i18n";

/** Texts of the stores' own toasts. */
export const storeMessages = defineMessages(
  {
    saveFailed: (error: string) => `Sauvegarde impossible : ${error}`,
    duplicateName: (name: string) => `Un workspace s'appelle déjà « ${name} ».`,
  },
  {
    saveFailed: (error: string) => `Could not save: ${error}`,
    duplicateName: (name: string) => `A workspace is already named "${name}".`,
  },
);
