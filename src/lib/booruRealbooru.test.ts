import { describe, expect, it } from "vitest";
import {
  booruNextPid,
  booruPagePid,
  booruWallHasMore,
} from "./booruFetch";
import {
  fileUrlFromRealbooruThumb,
  parseRealbooruListHtml,
  posterUrlFromRealbooruThumb,
  REALBOORU_PAGE_SIZE,
  sampleUrlFromRealbooruThumb,
  tagsFromRealbooruTitle,
} from "./booruRealbooru";

const LIST_HTML = `
<div class="col thumb" id="s1004899"><a id="p1004899" href="https://realbooru.com/index.php?page=post&amp;s=view&amp;id=1004899"><img src="https://realbooru.com/thumbnails/46/81/thumbnail_46814ebbd60773c43ec87dc76b59f13c.jpg" title="tagme, webm" alt="Image: 1004899" style="border: 3px solid #0000ff;"/></a></div>
<div class="col thumb" id="s1004896"><a id="p1004896" href="https://realbooru.com/index.php?page=post&amp;s=view&amp;id=1004896"><img src="https://realbooru.com/thumbnails/24/35/thumbnail_2435344f20beabd5571e875f1fa8750e.jpg" title="1boy1girl, black hair, blowjob, tagme, vaginal sex, webm" alt="Image: 1004896"/></a></div>
<div class="col thumb" id="s1004884"><a id="p1004884" href="index.php?page=post&amp;s=view&amp;id=1004884"><img src="https://realbooru.com/thumbnails/4c/19/thumbnail_4c19ccf5a6971743dc453090acad7d6f.jpg" title="anal insertion, bambifyme, solo" alt="Image: 1004884"/></a></div>
<div class="col thumb" id="s9"><a id="p9" href="index.php?page=post&amp;s=view&amp;id=9"><img src="https://realbooru.com/thumbnails/df/ef/thumbnail_dfefc6cb709e84a1d23148529feda3e4.jpg" title="solo, 1girl" alt="Image: 9"/></a></div>
`;

function idsFromHrefQuery(html: string): string[] {
  const ids: string[] = [];
  const re = /[?&]id=(\d+)/gi;
  for (;;) {
    const m = re.exec(html);
    if (!m) break;
    ids.push(m[1]!);
  }
  return ids;
}

describe("realbooru html 0.2 list", () => {
  it("parses pN ids even when href only has &amp;id=", () => {
    expect(idsFromHrefQuery(LIST_HTML)).toEqual([]);
    const posts = parseRealbooruListHtml(LIST_HTML);
    expect(posts.map((p) => p.id)).toEqual([
      "1004899",
      "1004896",
      "1004884",
      "9",
    ]);
  });

  it("parses hex thumbnail dirs, jpeg stills, and webm originals", () => {
    const posts = parseRealbooruListHtml(LIST_HTML);
    expect(posts).toHaveLength(4);
    expect(posts[0]).toMatchObject({
      id: "1004899",
      previewUrl:
        "https://realbooru.com/thumbnails/46/81/thumbnail_46814ebbd60773c43ec87dc76b59f13c.jpg",
      fileUrl:
        "https://realbooru.com/images/46/81/46814ebbd60773c43ec87dc76b59f13c.webm",
      sampleUrl:
        "https://realbooru.com/images/46/81/46814ebbd60773c43ec87dc76b59f13c.jpg",
      tags: "tagme webm",
    });
    expect(posts[1]?.fileUrl).toContain(".webm");
    expect(posts[1]?.tags).toContain("black_hair");
    expect(posts[2]).toMatchObject({
      id: "1004884",
      fileUrl:
        "https://realbooru.com/images/4c/19/4c19ccf5a6971743dc453090acad7d6f.jpeg",
      sampleUrl:
        "https://realbooru.com/samples/4c/19/sample_4c19ccf5a6971743dc453090acad7d6f.jpg",
    });
    expect(posts[3]).toMatchObject({
      id: "9",
      fileUrl:
        "https://realbooru.com/images/df/ef/dfefc6cb709e84a1d23148529feda3e4.jpeg",
      sampleUrl:
        "https://realbooru.com/samples/df/ef/sample_dfefc6cb709e84a1d23148529feda3e4.jpg",
      tags: "solo 1girl",
    });
  });

  it("splits comma titles into underscored tokens", () => {
    expect(tagsFromRealbooruTitle("black hair, blowjob,  webm")).toBe(
      "black_hair blowjob webm",
    );
  });

  it("prefers mp4 over thumb jpg when tagged video", () => {
    expect(
      fileUrlFromRealbooruThumb(
        "https://realbooru.com/thumbnails/24/35/thumbnail_abc.jpg",
        "tagme mp4",
      ),
    ).toBe("https://realbooru.com/images/24/35/abc.mp4");
  });

  it("derives sample jpg and video poster from the thumb path", () => {
    const stillThumb =
      "https://realbooru.com/thumbnails/4c/19/thumbnail_4c19ccf5a6971743dc453090acad7d6f.jpg";
    const videoThumb =
      "https://realbooru.com/thumbnails/46/81/thumbnail_46814ebbd60773c43ec87dc76b59f13c.jpg";
    expect(sampleUrlFromRealbooruThumb(stillThumb)).toBe(
      "https://realbooru.com/samples/4c/19/sample_4c19ccf5a6971743dc453090acad7d6f.jpg",
    );
    expect(posterUrlFromRealbooruThumb(videoThumb)).toBe(
      "https://realbooru.com/images/46/81/46814ebbd60773c43ec87dc76b59f13c.jpg",
    );
  });
});

describe("realbooru html02 paging", () => {
  it("treats hub pid as a post offset, not a dapi page index", () => {
    expect(booruPagePid("gelbooru", 1)).toBe(1);
    expect(booruPagePid("censored", 2)).toBe(2);
    expect(booruPagePid("realbooru", 0)).toBe(0);
    expect(booruPagePid("realbooru", 1)).toBe(REALBOORU_PAGE_SIZE);
    expect(booruNextPid("gelbooru", 0, 36)).toBe(1);
    expect(booruNextPid("xbooru", 4, 36)).toBe(5);
    expect(booruNextPid("realbooru", 0, 29)).toBe(29);
    expect(booruNextPid("realbooru", 29, 35)).toBe(64);
  });

  it("keeps hasMore on a full ~29 HTML page", () => {
    expect(booruWallHasMore("gelbooru", 36, 36)).toBe(true);
    expect(booruWallHasMore("gelbooru", 29, 36)).toBe(false);
    expect(booruWallHasMore("censored", 36, 36)).toBe(true);
    expect(booruWallHasMore("realbooru", 29, 36)).toBe(true);
    expect(booruWallHasMore("realbooru", 28, 36)).toBe(true);
    expect(booruWallHasMore("realbooru", 4, 36)).toBe(false);
  });
});
