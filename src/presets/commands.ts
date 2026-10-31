import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { isGroup } from "@/canvas/groups";
import type { Command } from "@/commands/command";
import { requestUi } from "@/commands/uiRequests";
import { messages } from "@/i18n";
import { deployPreset } from "./deploy";
import { liveDeployDeps } from "./live";
import { presetAgentCount, type TeamPreset } from "./model";
import { presetsMessages } from "./messages";
import { presetsStore } from "./store";

const text = () => messages(presetsMessages);
const section = () => text().section;
const inProject: Command["available"] = (ctx) => ctx.project;

/** A command whose text is read when the palette lists or searches it: it follows the language. */
function worded(base: Omit<Command, "label" | "keywords">, label: () => string, keywords: () => readonly string[]): Command {
  return Object.defineProperties({ ...base } as Command, {
    label: { get: label, enumerable: true },
    keywords: { get: keywords, enumerable: true },
  });
}

async function deploy(preset: TeamPreset) {
  const result = await deployPreset(preset, await liveDeployDeps());
  const t = text().toast;
  toast(t.deployed(preset.name, result));
  if (result.substituted > 0) toast.warning(t.substituted(result.substituted));
  if (result.orchestratorsSkipped > 0) toast.warning(t.orchestratorsSkipped(result.orchestratorsSkipped));
}

/**
 * The palette's lines for the presets (spec presets §3): saving the team on
 * screen, then deploying and deleting each preset. Added to the registry's
 * commands when the palette lists them.
 */
export function presetCommands(presets: readonly TeamPreset[]): Command[] {
  const save = worded(
    {
      id: "presets.save",
      section,
      available: (ctx) => inProject(ctx) && canvasStore.getState().frames.some((f) => isGroup(f) && f.memberIds.length > 0),
      run: () => requestUi({ kind: "savePreset" }),
    },
    () => text().save,
    () => text().saveKeywords,
  );
  const perPreset = presets.flatMap((preset): Command[] => [
    worded(
      { id: `presets.deploy.${preset.id}`, section, available: inProject, run: () => deploy(preset) },
      () => text().deploy(preset.name, presetAgentCount(preset)),
      () => text().deployKeywords(preset.name),
    ),
    worded(
      {
        id: `presets.remove.${preset.id}`,
        section,
        available: inProject,
        run: async () => {
          await presetsStore.getState().remove(preset.id);
          // The delete line can rank first for a search of the name: it is taken back from the toast.
          toast(text().toast.removed(preset.name), {
            action: {
              label: text().toast.undo,
              onClick: () => void presetsStore.getState().save(preset).catch((error: unknown) => toast.error(text().toast.failed(String(error)))),
            },
          });
        },
      },
      () => text().remove(preset.name),
      () => text().removeKeywords(preset.name),
    ),
  ]);
  return [save, ...perPreset];
}
