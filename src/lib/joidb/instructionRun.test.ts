import { beforeEach, describe, expect, it } from "vitest";
import { createReadingRun } from "../doujin/readingRun";
import {
  applyInstructionCue,
  noteReadingVideo,
  taskFromInstructionCue,
} from "./instructionRun";
import { parseJoidbVtt } from "./parseVtt";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  addToJoidbList,
  createJoidbList,
  listedJoidbIds,
  listJoidbLists,
  toggleInJoidbList,
} from "./joidbLists";
import type { JoidbVideo } from "./parseCatalog";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

function video(id: string, title = "T"): JoidbVideo {
  return {
    id,
    mediaId: `joidb-${id}`,
    title,
    duration: "1:00",
    durationSec: 60,
    thumbnail: `https://cdn-s.the-joi-database.com/videos/${id}/t.webp`,
    exclusive: false,
  };
}

describe("joidb lists", () => {
  it("stores queues under joi-joidb-lists-v1", async () => {
    const list = await createJoidbList("Вечер");
    await addToJoidbList(list.id, video("13fb525278d1e531a534a681"));
    const rows = await listJoidbLists();
    expect(rows[0]?.items[0]?.mediaId).toBe(
      "joidb-13fb525278d1e531a534a681",
    );
    expect(listedJoidbIds(rows).has("joidb-13fb525278d1e531a534a681")).toBe(
      true,
    );
    await toggleInJoidbList(list.id, video("13fb525278d1e531a534a681"));
    expect((await listJoidbLists())[0]?.items).toHaveLength(0);
  });
});

describe("instruction video run", () => {
  it("maps a text cue onto the HUD without pickReadingTask pages", () => {
    const cue = parseJoidbVtt(`WEBVTT

x
00:00:05.000 --> 00:00:12.000
Edge now
`)[0]!;
    const task = taskFromInstructionCue(cue, "abc");
    expect(task.kind).toBe("edge");
    expect(task.ruleRu).toBe("Edge now");
    const run = createReadingRun({
      listId: "l",
      listName: "Вечер",
      listTotal: 2,
      origin: "user",
      moodScore: 0,
      source: "joidb",
      now: 1,
    });
    const withCue = applyInstructionCue(run, { videoId: "abc", cue });
    expect(withCue.state.activeTask?.specId).toBe("joidb-cue-x");
    const noted = noteReadingVideo(withCue.state, {
      listId: "l",
      videoId: "abc",
      title: "T",
      index: 0,
      total: 2,
    });
    expect(noted.state.pagesShown).toBe(1);
    expect(noted.state.activeTask?.specId).toBe("joidb-cue-x");
    const cleared = applyInstructionCue(noted.state, {
      videoId: "abc",
      cue: null,
    });
    expect(cleared.state.activeTask).toBeNull();
  });
});
