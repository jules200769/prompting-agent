import { beforeEach, describe, expect, it } from "vitest";
import type { LibraryItem } from "../../shared/types";
import { createStudioService } from "./studioService";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe("local Studio service", () => {
  let items: LibraryItem[];
  let now: number;
  let service: ReturnType<typeof createStudioService>;

  beforeEach(() => {
    items = [
      {
        id: "legacy",
        title: "Legacy code prompt",
        originalText: "fix code",
        optimizedText: "Fix this code carefully",
        model: "gpt-5",
        level: 2,
        score: 80,
        tags: ["code"],
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    now = 100;
    service = createStudioService({
      storage: new MemoryStorage(),
      listLibrary: async () => items,
      saveLibrary: async (input) => {
        const item = { ...input, id: "saved", createdAt: now, updatedAt: now };
        items.push(item);
        return item;
      },
      deleteLibrary: async (id) => {
        items = items.filter((item) => item.id !== id);
      },
      now: () => now,
    });
  });

  it("enriches existing library records without changing their content", async () => {
    const [entry] = await service.listLibrary();
    expect(entry).toMatchObject({
      id: "legacy",
      originalText: "fix code",
      category: "code",
      pinned: false,
      origin: "personal",
    });
  });

  it("creates, updates, and deletes instructions", async () => {
    const created = await service.saveInstruction({
      title: "Be concise",
      detail: "Use direct language.",
      enabledByDefault: true,
    });
    now = 200;
    await service.saveInstruction({ ...created, detail: "Answer first." });
    expect(await service.listInstructions()).toMatchObject([{ detail: "Answer first.", createdAt: 100, updatedAt: 200 }]);
    await service.deleteInstruction(created.id);
    expect(await service.listInstructions()).toEqual([]);
  });

  it("changes plans and aligns the usage limit", async () => {
    const subscription = await service.selectPlan("starter", "yearly");
    expect(subscription).toMatchObject({ planId: "starter", interval: "yearly" });
    expect(await service.getUsage()).toMatchObject({ limit: 1_000 });
  });

  it("persists pin state for migrated items", async () => {
    await service.setLibraryPinned("legacy", true);
    expect(await service.listLibrary()).toMatchObject([{ id: "legacy", pinned: true }]);
  });
});
