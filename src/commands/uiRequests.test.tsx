// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { pendingUiRequest, requestUi, useUiRequest } from "./uiRequests";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Tab({ id, seen }: { id: string; seen: string[] }) {
  useUiRequest("renameWorkspace", (request) => {
    if (request.id !== id) return false;
    seen.push(id);
    return true;
  });
  return null;
}

it("lets the right component answer a request, once, even one made before it mounted", async () => {
  const seen: string[] = [];
  requestUi({ kind: "renameWorkspace", id: "w2" });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        <Tab id="w1" seen={seen} />
        <Tab id="w2" seen={seen} />
      </>,
    ),
  );
  expect(seen).toEqual(["w2"]);
  expect(pendingUiRequest()).toBeNull();
  await act(async () => requestUi({ kind: "renameWorkspace", id: "w1" }));
  expect(seen).toEqual(["w2", "w1"]);
  // A request nobody answers stays pending, never mistaken for another kind.
  await act(async () => requestUi({ kind: "composeGroup" }));
  expect(pendingUiRequest()).toEqual({ kind: "composeGroup" });
  await act(async () => root.unmount());
});

it("lets an unanswered request expire: it must not fire at a later mount (plan F2)", async () => {
  vi.useFakeTimers();
  requestUi({ kind: "composeGroup" });
  expect(pendingUiRequest()).toEqual({ kind: "composeGroup" });
  vi.advanceTimersByTime(2000);
  expect(pendingUiRequest()).toBeNull();
  // A newer request is not dropped by the older one's timer.
  requestUi({ kind: "composeGroup" });
  vi.advanceTimersByTime(1500);
  requestUi({ kind: "groupMenu", id: "g" });
  vi.advanceTimersByTime(1500);
  expect(pendingUiRequest()).toEqual({ kind: "groupMenu", id: "g" });
  vi.advanceTimersByTime(1000);
  expect(pendingUiRequest()).toBeNull();
  vi.useRealTimers();
});

it("drops a pending request when the user moves to another workspace or project", async () => {
  const { workspacesStore } = await import("@/store/workspaces");
  const { projectsStore } = await import("@/store/projects");
  requestUi({ kind: "composeGroup" });
  workspacesStore.setState({ activeId: "w-other" });
  expect(pendingUiRequest()).toBeNull();
  requestUi({ kind: "composeGroup" });
  workspacesStore.setState({ projectId: "p-other" });
  expect(pendingUiRequest()).toBeNull();
  requestUi({ kind: "composeGroup" });
  projectsStore.setState({ view: "home" } as never);
  expect(pendingUiRequest()).toBeNull();
  projectsStore.setState({ view: "project" } as never);
});
