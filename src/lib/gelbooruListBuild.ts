import { gelbooruRecsQuery, isGelbooruRecsTasteTag } from "./contentHub";
import {
  mistressQueueName,
  tagPullQueueName,
} from "./doujin/readingRunBuild";
import { buildFavoriteTasteProfile } from "./favoriteTagTaste";
import {
  ASSEMBLE_MAX_FETCHES,
  assembleQuotas,
  createAssemblePicker,
  formatAssembleNote,
  formatTagPullNote,
  isThinAssembleBatch,
  perQueryCap,
  spillOwnShortfall,
  type AssembleBucket,
  type AssemblePullLog,
} from "./gelbooruAssemblePreset";
import {
  addManyToGelbooruList,
  createGelbooruList,
  mergeUniqueMedia,
  type GelbooruListOrigin,
  type GelbooruPlayList,
} from "./gelbooruLists";
import { mediaTypeEntry } from "./mediaTypeFilter";
import {
  DEFAULT_MEDIA_SETTINGS,
  fetchGelbooru,
  loadMediaSettings,
  shuffleMediaItems,
  type MediaItem,
} from "./media";
import { listFavoriteMetadata } from "./mediaFavorites";
import { snapMediaQueueSize, type MediaQueueSize } from "./mediaQueue";
import { getActiveMistress } from "./mistress";

function tasteTags(
  rows: ReadonlyArray<{ tag: string }>,
): string[] {
  return rows
    .map((row) => row.tag.trim())
    .filter((tag) => tag.length > 0 && isGelbooruRecsTasteTag(tag));
}

export async function assembleGelbooruMistressList(
  size: MediaQueueSize,
  opts?: { appendToId?: string },
): Promise<GelbooruPlayList> {
  const want = snapMediaQueueSize(size);
  const media = loadMediaSettings();
  const pack = getActiveMistress();
  const character = pack.characterTags[0]?.trim() ?? "";
  const fallback =
    media.tags.trim() ||
    pack.media.primaryDefaultTags ||
    DEFAULT_MEDIA_SETTINGS.tags;
  const credentials = {
    userId: media.gelbooruUserId,
    apiKey: media.gelbooruApiKey,
  };
  const rows = await listFavoriteMetadata();
  const taste = buildFavoriteTasteProfile(rows);
  const liked = tasteTags(taste.liked);
  const disliked = tasteTags(taste.disliked);
  const quotas = assembleQuotas(want, pack.media.assemble);
  const picker = createAssemblePicker({
    preset: pack.media.assemble,
    character,
    liked,
    disliked,
  });

  let collected: MediaItem[] = [];
  let fetches = 0;
  const pulls: AssemblePullLog[] = [];
  const got: Record<AssembleBucket, number> = {
    liked: 0,
    disliked: 0,
    own: 0,
  };

  const pull = async (
    bucket: AssembleBucket,
    query: string,
    target: number,
  ): Promise<number> => {
    if (
      fetches >= ASSEMBLE_MAX_FETCHES ||
      collected.length >= want ||
      got[bucket] >= target
    ) {
      return 0;
    }
    fetches += 1;
    const batch = await fetchGelbooru(query, 100, credentials, { pid: 0 });
    const remainBucket = Math.max(0, target - got[bucket]);
    const remainTotal = Math.max(0, want - collected.length);
    const take = Math.min(remainTotal, remainBucket, perQueryCap(target));
    const before = collected.length;
    collected = mergeUniqueMedia(collected, batch, before + take);
    const added = collected.length - before;
    got[bucket] += added;
    pulls.push({ bucket, query, added });
    return added;
  };

  const fill = async (bucket: AssembleBucket, target: number) => {
    while (
      got[bucket] < target &&
      fetches < ASSEMBLE_MAX_FETCHES &&
      collected.length < want
    ) {
      const pick =
        bucket === "own" ? picker.nextOwn() : picker.nextShelf(bucket);
      if (!pick) break;
      let added = await pull(bucket, pick.query, target);
      if (bucket !== "own") continue;
      while (
        isThinAssembleBatch(added) &&
        got.own < target &&
        fetches < ASSEMBLE_MAX_FETCHES &&
        collected.length < want
      ) {
        const fb = picker.fallbackOwn();
        if (!fb) break;
        added = await pull("own", fb.query, target);
        if (!isThinAssembleBatch(added)) break;
      }
    }
  };

  await fill("own", quotas.own);
  const spill = spillOwnShortfall(
    Math.max(0, quotas.own - got.own),
    pack.media.assemble,
  );
  await fill("liked", quotas.liked + spill.liked);
  await fill("disliked", quotas.disliked + spill.disliked);

  const rescue = picker.characterRescueQuery();
  if (
    rescue &&
    collected.length < want &&
    fetches < ASSEMBLE_MAX_FETCHES
  ) {
    fetches += 1;
    const batch = await fetchGelbooru(rescue, 100, credentials, { pid: 0 });
    const before = collected.length;
    collected = mergeUniqueMedia(collected, batch, want);
    pulls.push({
      bucket: "rescue",
      query: rescue,
      added: collected.length - before,
    });
  }

  for (
    let page = 0;
    collected.length < want && fetches < ASSEMBLE_MAX_FETCHES;
    page += 1
  ) {
    fetches += 1;
    const tags = gelbooruRecsQuery(taste.liked, page, fallback);
    const batch = await fetchGelbooru(tags, 100, credentials, { pid: page });
    const before = collected.length;
    collected = mergeUniqueMedia(collected, batch, want);
    pulls.push({
      bucket: "recs",
      query: tags,
      added: collected.length - before,
    });
    if (batch.length === 0 || collected.length === before) break;
  }

  collected = shuffleMediaItems(collected).slice(0, want);

  if (opts?.appendToId) {
    const next = await addManyToGelbooruList(opts.appendToId, collected);
    if (!next) throw new Error("Список не найден");
    return next;
  }

  return saveGelbooruQueueList({
    name: mistressQueueName(),
    origin: "mistress",
    note: formatAssembleNote({
      mistressName: pack.displayNameRu,
      want,
      got: collected.length,
      pulls,
    }),
    items: collected,
  });
}

export async function saveGelbooruQueueList(opts: {
  name: string;
  origin: GelbooruListOrigin;
  note: string;
  items: readonly MediaItem[];
}): Promise<GelbooruPlayList> {
  const list = await createGelbooruList(opts.name, {
    origin: opts.origin,
    note: opts.note,
  });
  return (
    (await addManyToGelbooruList(list.id, opts.items)) ?? {
      ...list,
      items: [],
    }
  );
}

export async function saveTagPullAsGelbooruList(opts: {
  mediaTypeId: string;
  tags: string;
  query: string;
  usedTags?: string;
  attempted?: readonly string[];
  items: readonly MediaItem[];
  want: number;
}): Promise<GelbooruPlayList> {
  const typeLabel = mediaTypeEntry(opts.mediaTypeId).labelRu;
  return saveGelbooruQueueList({
    name: tagPullQueueName(typeLabel),
    origin: "user",
    note: formatTagPullNote({
      mediaTypeLabel: typeLabel,
      tags: opts.tags,
      query: opts.query,
      usedTags: opts.usedTags,
      attempted: opts.attempted,
      got: opts.items.length,
      want: opts.want,
    }),
    items: opts.items,
  });
}
