import { describe, expect, it } from "vitest";
import {
  fileUrlFromGelbooru01Thumb,
  parseGelbooru01ListHtml,
  tagsFromGelbooru01Title,
} from "./booruGelbooru01";
import {
  booruCdnReferer,
  booruDapiProxyPath,
  booruMediaId,
  booruPostIdFromMediaId,
  booruSite,
  booruSiteFromMediaId,
  favoriteIdBelongsToBooruSite,
  inferBooruSite,
  isBooruSiteId,
  isDapiSiteId,
} from "./booruSites";

const LIST_HTML = `
<span class="thumb"><a id="p118525" href="index.php?page=post&amp;s=view&amp;id=118525"><img src="https://thumbs.booru.org/blacked/thumbnails//104/thumbnail_cde13a01bbfda83799ab534ce251d864f4fb9641.png" alt="post" border="0" title=" 1girl blacked milf  score:0 rating:Questionable"/></a>
</span><span class="thumb"><a id="p118519" href="index.php?page=post&amp;s=view&amp;id=118519"><img src="https://thumbs.booru.org/blacked/thumbnails//104/thumbnail_5b20b90d81e9c7caf4be49ebfabf69e5b4bb7d60.gif" title=" 1girl animated  score:0 rating:Explicit"/></a>
</span>
`;

describe("gelbooru 0.1 html list", () => {
  it("parses thumbs, tags, and derived file urls", () => {
    const posts = parseGelbooru01ListHtml(LIST_HTML);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      id: "118525",
      previewUrl:
        "https://thumbs.booru.org/blacked/thumbnails//104/thumbnail_cde13a01bbfda83799ab534ce251d864f4fb9641.png",
      fileUrl:
        "https://img.booru.org/blacked//images/104/cde13a01bbfda83799ab534ce251d864f4fb9641.png",
      tags: "1girl blacked milf",
    });
    expect(posts[1]?.fileUrl).toContain(".gif");
  });

  it("strips score/rating from the title blob", () => {
    expect(
      tagsFromGelbooru01Title(
        " 1boy 1girl handjob  score:2 rating:Explicit",
      ),
    ).toBe("1boy 1girl handjob");
  });

  it("derives originals from thumbnail CDN paths", () => {
    expect(
      fileUrlFromGelbooru01Thumb(
        "https://thumbs.booru.org/censored/thumbnails//9/thumbnail_abc123def.png",
      ),
    ).toBe("https://img.booru.org/censored//images/9/abc123def.png");
  });
});

describe("booru site ids", () => {
  it("namespaces media ids per site", () => {
    expect(booruMediaId("gelbooru", "42")).toBe("gb-42");
    expect(booruMediaId("blacked", "42")).toBe("blacked-42");
    expect(booruMediaId("xbooru", "42")).toBe("xb-42");
    expect(booruMediaId("hypnohub", "42")).toBe("hh-42");
    expect(booruMediaId("realbooru", "42")).toBe("rb-42");
    expect(booruPostIdFromMediaId("blacked-42")).toBe("42");
    expect(booruPostIdFromMediaId("xb-42")).toBe("42");
    expect(booruPostIdFromMediaId("hh-9")).toBe("9");
    expect(booruPostIdFromMediaId("rb-9")).toBe("9");
    expect(booruSiteFromMediaId("censored-9")).toBe("censored");
    expect(booruSiteFromMediaId("xb-9")).toBe("xbooru");
    expect(booruSiteFromMediaId("hh-9")).toBe("hypnohub");
    expect(booruSiteFromMediaId("rb-9")).toBe("realbooru");
    expect(booruSiteFromMediaId("gb-9-7")).toBe("gelbooru");
  });

  it("keeps legacy unprefixed favorites on gelbooru", () => {
    expect(favoriteIdBelongsToBooruSite("local-1", "gelbooru")).toBe(true);
    expect(favoriteIdBelongsToBooruSite("gb-1", "gelbooru")).toBe(true);
    expect(favoriteIdBelongsToBooruSite("blacked-1", "gelbooru")).toBe(false);
    expect(favoriteIdBelongsToBooruSite("blacked-1", "blacked")).toBe(true);
    expect(favoriteIdBelongsToBooruSite("xb-1", "gelbooru")).toBe(false);
    expect(favoriteIdBelongsToBooruSite("xb-1", "xbooru")).toBe(true);
    expect(favoriteIdBelongsToBooruSite("hh-1", "hypnohub")).toBe(true);
    expect(favoriteIdBelongsToBooruSite("hh-1", "xbooru")).toBe(false);
    expect(favoriteIdBelongsToBooruSite("rb-1", "realbooru")).toBe(true);
    expect(favoriteIdBelongsToBooruSite("rb-1", "gelbooru")).toBe(false);
    expect(
      favoriteIdBelongsToBooruSite("joidb-13fb525278d1e531a534a681", "gelbooru"),
    ).toBe(false);
  });

  it("infers site from id when the field is missing", () => {
    expect(inferBooruSite({ id: "blacked-3" })).toBe("blacked");
    expect(inferBooruSite({ id: "xb-3" })).toBe("xbooru");
    expect(inferBooruSite({ id: "hh-3" })).toBe("hypnohub");
    expect(inferBooruSite({ id: "rb-3" })).toBe("realbooru");
    expect(inferBooruSite({ id: "gb-3", booruSite: "gelbooru" })).toBe(
      "gelbooru",
    );
  });

  it("picks CDN referer from the image host path", () => {
    expect(
      booruCdnReferer(
        "https://img.booru.org/blacked//images/104/abc.png",
      ),
    ).toBe("https://blacked.booru.org/");
    expect(
      booruCdnReferer(
        "https://thumbs.booru.org/censored/thumbnails//1/thumbnail_x.jpg",
      ),
    ).toBe("https://censored.booru.org/");
    expect(booruCdnReferer("https://img3.gelbooru.com/images/x.jpg")).toBe(
      null,
    );
    expect(booruCdnReferer("https://img.xbooru.com/images/1/abc.jpg")).toBe(
      "https://xbooru.com/",
    );
    expect(
      booruCdnReferer("https://xbooru.com/thumbnails/1/thumbnail_abc.jpg"),
    ).toBe("https://xbooru.com/");
    expect(booruCdnReferer("https://hypnohub.net/images/1/abc.jpg")).toBe(
      "https://hypnohub.net/",
    );
    expect(
      booruCdnReferer(
        "https://img.xbooru.com/images/148/abfd08e934789ae172823aa00eab2217.png",
      ),
    ).toBe("https://xbooru.com/");
    expect(
      booruCdnReferer(
        "https://hypnohub.net/samples/7b/sample_7b9976dae027d7c4.png",
      ),
    ).toBe("https://hypnohub.net/");
    expect(
      booruCdnReferer(
        "https://hypnohub.net/thumbnails/7b/99/thumbnail_7b9976.jpg",
      ),
    ).toBe("https://hypnohub.net/");
    expect(
      booruCdnReferer(
        "https://realbooru.com/images/24/35/2435344f20beabd5571e875f1fa8750e.mp4",
      ),
    ).toBe("https://realbooru.com/");
    expect(
      booruCdnReferer(
        "https://realbooru.com/thumbnails/46/81/thumbnail_46814ebbd60773c43ec87dc76b59f13c.jpg",
      ),
    ).toBe("https://realbooru.com/");
  });

  it("routes gelbooru-family dapi without keys except gelbooru.com", () => {
    expect(isBooruSiteId("xbooru")).toBe(true);
    expect(isBooruSiteId("hypnohub")).toBe(true);
    expect(isBooruSiteId("realbooru")).toBe(true);
    expect(isDapiSiteId("xbooru")).toBe(true);
    expect(isDapiSiteId("hypnohub")).toBe(true);
    expect(isDapiSiteId("realbooru")).toBe(false);
    expect(booruSite("gelbooru").needsKey).toBe(true);
    expect(booruSite("xbooru").needsKey).toBe(false);
    expect(booruSite("hypnohub").needsKey).toBe(false);
    expect(booruSite("realbooru").needsKey).toBe(false);
    expect(booruSite("realbooru").api).toBe("html02");
    expect(booruSite("xbooru").api).toBe("dapi");
    expect(booruSite("hypnohub").api).toBe("dapi");
    expect(booruDapiProxyPath("gelbooru")).toBe("/api/gelbooru");
    expect(booruDapiProxyPath("xbooru")).toBe("/api/booru/xbooru");
    expect(booruDapiProxyPath("hypnohub")).toBe("/api/booru/hypnohub");
  });
});
