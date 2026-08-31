import { describe, expect, it } from "vitest";
import {
  joidbMediaId,
  parseJoidbDuration,
  parseJoidbMediaId,
} from "./origin";
import {
  parseJoidbApiHtmlPayload,
  parseJoidbCatalogHtml,
  parseJoidbWatchPage,
  parseJoidbWatchTags,
} from "./parseCatalog";

const CATALOG = `
<div class="col-lg-2 video-thumbnail-block" id="video-block-17223">
  <asis-video-thumbnail video-title="Try not to cum for Marciana&#039;s new swimsuit"
                        duration="16:04"
                        video-id="04bb676d04d548e861592eb9"
                        explicit=""
                        is_patreon_exclusive=""
                        thumbnail="https://cdn-s.the-joi-database.com/videos/04bb676d04d548e861592eb9/thumbnail.webp">
  </asis-video-thumbnail>
</div>
<div class="col-lg-2 video-thumbnail-block" id="video-block-9106">
  <asis-video-thumbnail video-title="A teasing threesome"
                        duration="1:01:25"
                        video-id="13fb525278d1e531a534a681"
                        is_patreon_exclusive="1"
                        thumbnail="https://cdn-s.the-joi-database.com/videos/13fb525278d1e531a534a681/t.webp">
  </asis-video-thumbnail>
</div>
<ul class="pagination">
  <li class='page-item active'><a class='page-link' href="/videos?page=1">1</a></li>
  <li class='page-item'><a class='page-link' href="/videos?page=2">2</a></li>
  <li class='page-item'><a class='page-link' href="/videos?page=5">5</a></li>
</ul>
`;

describe("joidb ids", () => {
  it("prefixes hex ids", () => {
    expect(joidbMediaId("13fb525278d1e531a534a681")).toBe(
      "joidb-13fb525278d1e531a534a681",
    );
    expect(parseJoidbMediaId("joidb-13fb525278d1e531a534a681")).toBe(
      "13fb525278d1e531a534a681",
    );
    expect(parseJoidbMediaId("gb-12")).toBeNull();
  });

  it("parses clock durations", () => {
    expect(parseJoidbDuration("16:04")).toBe(964);
    expect(parseJoidbDuration("1:01:25")).toBe(3685);
  });
});

describe("joidb catalog html", () => {
  it("reads asis-video-thumbnail cards and pager", () => {
    const page = parseJoidbCatalogHtml(CATALOG);
    expect(page.page).toBe(1);
    expect(page.pages).toBe(5);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.id).toBe("04bb676d04d548e861592eb9");
    expect(page.items[0]?.title).toContain("Marciana");
    expect(page.items[0]?.mediaId).toBe("joidb-04bb676d04d548e861592eb9");
    expect(page.items[1]?.exclusive).toBe(true);
    expect(page.items[1]?.durationSec).toBe(3685);
  });

  it("unwraps infinite-scroll JSON html", () => {
    const html = parseJoidbApiHtmlPayload({
      status: 200,
      data: { html: CATALOG },
    });
    expect(parseJoidbCatalogHtml(html).items).toHaveLength(2);
  });

  it("reads watch-page tag pills", () => {
    const tags = parseJoidbWatchTags(`
      <a class='small badge' href="/videos?search=edging">edging</a>
      <a class='small badge' href="/videos?search=femdom">femdom</a>
    `);
    expect(tags).toEqual(["edging", "femdom"]);
  });

  it("reads watch-page creator, tags and description", () => {
    const meta = parseJoidbWatchPage(`
      <a class='small badge badge-primary badge-pill' href="/videos?search=edging">edging</a>
      <a href='/profile/716b341ae668214d5179c674'>
        <h5 class='text-white'>ElyJOI</h5>
      </a>
      <p class='text-muted my-0 my-md-2 text-break'>
        Hold the edge for Marciana&#039;s swimsuit.
      </p>
    `);
    expect(meta.tags).toEqual(["edging"]);
    expect(meta.creator).toBe("ElyJOI");
    expect(meta.description).toBe("Hold the edge for Marciana's swimsuit.");
  });

  it("drops the empty watch description placeholder", () => {
    const meta = parseJoidbWatchPage(`
      <p class='text-muted my-0 my-md-2 text-break'>
        No description has been written.
      </p>
    `);
    expect(meta.description).toBe("");
  });
});
