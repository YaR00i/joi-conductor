import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentTab } from "../../lib/contentHub";
import {
  fetchJoidbPopular,
  fetchJoidbVtt,
  fetchJoidbVideos,
} from "../../lib/joidb/client";
import { isJoidbMediaId } from "../../lib/joidb/origin";
import {
  favoriteMetadataToJoidbVideo,
  fetchJoidbFavoritePoster,
  joidbVideoToFavItem,
} from "../../lib/joidb/joidbFavorites";
import {
  addToJoidbList,
  createJoidbList,
  deleteJoidbList,
  listedJoidbIds,
  listJoidbLists,
  moveInJoidbList,
  removeFromJoidbList,
  renameJoidbList,
  setJoidbListCursor,
  setJoidbListNote,
  toggleInJoidbList,
  type JoidbPlayList,
} from "../../lib/joidb/joidbLists";
import type { JoidbVideo } from "../../lib/joidb/parseCatalog";
import type { JoidbVttCue } from "../../lib/joidb/parseVtt";
import { useFavoriteSaveQueue } from "../../lib/favoriteSaveQueue";
import { readingRunHudVisible } from "../../lib/doujin/readingRun";
import {
  addFavoriteFromItem,
  listFavoriteMetadata,
  removeFavorite,
} from "../../lib/mediaFavorites";
import { JoidbBrowse } from "./JoidbBrowse";
import { JoidbListPicker } from "./JoidbListPicker";
import { JoidbLists, joidbVideoFromList } from "./JoidbLists";
import { JoidbWatch } from "./JoidbWatch";
import { useJoidbReadingRun } from "./useJoidbReadingRun";
import { DoujinReadingRunHud } from "../doujin/DoujinReadingRunHud";
import { DoujinReadingRunPrompt } from "../doujin/DoujinReadingRunPrompt";
import "./joidb.css";

type Props = { tab: ContentTab; onTabChange?: (tab: ContentTab) => void };

type OpenVideo = {
  video: JoidbVideo;
  listId?: string;
  index?: number;
  playing: boolean;
};

export function JoidbHub({ tab, onTabChange }: Props) {
  const [items, setItems] = useState<JoidbVideo[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState("");
  const [lists, setLists] = useState<JoidbPlayList[]>([]);
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<JoidbVideo | null>(null);
  const [open, setOpen] = useState<OpenVideo | null>(null);
  const [cues, setCues] = useState<JoidbVttCue[]>([]);
  const [recsOffset, setRecsOffset] = useState(0);
  const [recsHasMore, setRecsHasMore] = useState(false);
  const loadMoreBusy = useRef(false);

  const refreshLists = useCallback(async () => {
    setLists(await listJoidbLists());
  }, []);
  const refreshSaved = useCallback(async () => {
    const rows = await listFavoriteMetadata();
    setSavedIds(new Set(rows.map((r) => r.id).filter(isJoidbMediaId)));
  }, []);

  const favSave = useFavoriteSaveQueue({
    onIdle: () => {
      void refreshSaved();
    },
  });

  useEffect(() => {
    void refreshLists();
    void refreshSaved();
  }, [refreshLists, refreshSaved]);

  const reading = useJoidbReadingRun({
    lists,
    onOpenPlay: (listId, index) => {
      const list = lists.find((row) => row.id === listId);
      const video = list ? joidbVideoFromList(list, index) : null;
      if (video) setOpen({ video, listId, index, playing: true });
    },
    onRefreshLists: refreshLists,
    onGoToListsOverview: () => {
      setOpenListId(null);
      onTabChange?.("lists");
    },
  });

  useEffect(() => {
    if (!open?.listId || open.index == null) return;
    const list = lists.find((row) => row.id === open.listId);
    if (list) reading.noteVideo(list, open.index);
    void setJoidbListCursor(open.listId, open.index);
  }, [open?.listId, open?.index, open?.video.id]);

  useEffect(() => {
    if (tab === "lists") return;
    if (tab === "library") {
      void listFavoriteMetadata().then((rows) => {
        setItems(
          rows
            .map(favoriteMetadataToJoidbVideo)
            .filter((row): row is JoidbVideo => Boolean(row)),
        );
        setLoading(false);
      });
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setPage(1);
    void (async () => {
      try {
        if (tab === "recs") {
          const rows = await fetchJoidbPopular(0, 24, ac.signal);
          setItems(rows);
          setRecsOffset(rows.length);
          setRecsHasMore(rows.length >= 24);
          return;
        }
        const result = await fetchJoidbVideos({
          page: 1,
          search: tab === "search" ? committed : undefined,
          signal: ac.signal,
        });
        setItems(result.items);
        setPage(result.page);
        setPages(result.pages);
      } catch (err) {
        if (!ac.signal.aborted) {
          setError(err instanceof Error ? err.message : "Ошибка каталога");
          setItems([]);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [tab, committed, tab === "library" ? savedIds.size : -1]);

  useEffect(() => {
    if (!open?.playing) {
      setCues([]);
      return;
    }
    const ac = new AbortController();
    void fetchJoidbVtt(open.video.id, ac.signal)
      .then((rows) => {
        if (!ac.signal.aborted) setCues(rows);
      })
      .catch(() => {
        if (!ac.signal.aborted) setCues([]);
      });
    return () => ac.abort();
  }, [open?.video.id, open?.playing]);

  function toggleSave(video: JoidbVideo) {
    if (favSave.isBusy(video.mediaId)) return;
    const nextOn = !savedIds.has(video.mediaId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nextOn) next.add(video.mediaId);
      else next.delete(video.mediaId);
      return next;
    });
    favSave.enqueue({
      id: video.mediaId,
      kind: nextOn ? "save" : "remove",
      mediaKind: "video",
      publicId: video.id,
      detail: video.title.trim()
        ? video.title.trim().length > 72
          ? `${video.title.trim().slice(0, 72).trim()}…`
          : video.title.trim()
        : video.id,
      run: async (report) => {
        try {
          if (nextOn) {
            report({ percent: null });
            const blob = await fetchJoidbFavoritePoster(video);
            report({ percent: 100, loadedBytes: blob.size, totalBytes: blob.size });
            await addFavoriteFromItem(joidbVideoToFavItem(video), blob);
          } else {
            await removeFavorite(video.mediaId);
          }
        } catch (err) {
          setSavedIds((prev) => {
            const next = new Set(prev);
            if (nextOn) next.delete(video.mediaId);
            else next.add(video.mediaId);
            return next;
          });
          throw err;
        }
      },
    });
  }

  function openFromList(listId: string, index: number) {
    const list = lists.find((row) => row.id === listId);
    const video = list ? joidbVideoFromList(list, index) : null;
    if (video) setOpen({ video, listId, index, playing: true });
  }

  function nextInList() {
    if (!open?.listId || open.index == null) return;
    const list = lists.find((row) => row.id === open.listId);
    const next = open.index + 1;
    if (!list || next >= list.items.length) {
      if (reading.runLive) reading.hitListEnd(open.listId);
      return;
    }
    openFromList(list.id, next);
  }

  const loadMore = useCallback(async () => {
    if (loadMoreBusy.current || loading) return;
    if (tab === "recs") {
      if (!recsHasMore) return;
      loadMoreBusy.current = true;
      setLoading(true);
      try {
        const rows = await fetchJoidbPopular(recsOffset, 24);
        setItems((prev) => [...prev, ...rows]);
        setRecsOffset((n) => n + rows.length);
        setRecsHasMore(rows.length >= 24);
      } finally {
        loadMoreBusy.current = false;
        setLoading(false);
      }
      return;
    }
    if (tab !== "newest" && tab !== "search") return;
    if (page >= pages) return;
    loadMoreBusy.current = true;
    setLoading(true);
    try {
      const result = await fetchJoidbVideos({
        page: page + 1,
        search: tab === "search" ? committed : undefined,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...result.items.filter((row) => !seen.has(row.id))];
      });
      setPage(result.page);
      setPages(result.pages);
    } finally {
      loadMoreBusy.current = false;
      setLoading(false);
    }
  }, [tab, loading, recsHasMore, recsOffset, page, pages, committed]);

  const startListId =
    reading.runPrompt?.kind === "start" ? reading.runPrompt.listId : "";
  const startPrompt =
    reading.runPrompt?.kind === "start" ? (
      <DoujinReadingRunPrompt
        kind="start"
        onStartFresh={() => reading.startRunFromPrompt(startListId, true)}
        onContinue={() => reading.startRunFromPrompt(startListId, false)}
        onCancel={reading.cancelPrompt}
      />
    ) : reading.runPrompt?.kind === "leave" ? (
      <DoujinReadingRunPrompt
        kind="leave"
        onStay={reading.stayInRun}
        onLeave={reading.leaveRun}
      />
    ) : null;

  const runHudOpen = readingRunHudVisible(
    reading.run,
    reading.runLive,
    open?.listId,
  );
  const hud =
    runHudOpen && reading.run && reading.hudHandlers ? (
      <DoujinReadingRunHud
        run={reading.run}
        now={reading.nowMs}
        otherLists={reading.otherLists}
        {...reading.hudHandlers}
      />
    ) : null;

  const pickerSheet = picker ? (
    <JoidbListPicker
      video={picker}
      lists={lists}
      onClose={() => setPicker(null)}
      onToggle={(listId) =>
        void toggleInJoidbList(listId, picker).then(refreshLists)
      }
      onCreate={(name) =>
        void createJoidbList(name).then(async (list) => {
          await addToJoidbList(list.id, picker);
          await refreshLists();
        })
      }
    />
  ) : null;

  const listedIds = listedJoidbIds(lists);

  if (open) {
    return (
      <>
        <JoidbWatch
          video={open.video}
          playing={open.playing}
          cues={cues}
          paused={runHudOpen && reading.run?.status === "paused"}
          related={items.filter((row) => row.id !== open.video.id).slice(0, 12)}
          savedIds={savedIds}
          listedIds={listedIds}
          busyIds={favSave.busyIds}
          onClose={() => reading.requestLeave(() => setOpen(null))}
          onPlay={() => setOpen({ ...open, playing: true })}
          onToggleSave={toggleSave}
          onOpenLists={setPicker}
          onOpenRelated={(video) =>
            reading.requestLeave(() => setOpen({ video, playing: false }))
          }
          onTag={(tag) => {
            reading.requestLeave(() => {
              setOpen(null);
              setQuery(tag);
              setCommitted(tag);
              onTabChange?.("search");
            });
          }}
          onEnded={nextInList}
          onCue={(cue) => reading.noteCue(cue, open.video.id)}
          hud={hud}
        />
        {pickerSheet}
        {startPrompt}
      </>
    );
  }

  if (tab === "lists") {
    return (
      <>
        <JoidbLists
          lists={lists}
          openListId={openListId}
          onOpenList={setOpenListId}
          onCreate={(name) => void createJoidbList(name).then(refreshLists)}
          onRename={(id, name) => void renameJoidbList(id, name).then(refreshLists)}
          onNote={(id, note) => void setJoidbListNote(id, note).then(refreshLists)}
          onDelete={(id) =>
            void deleteJoidbList(id).then(() => {
              setOpenListId(null);
              void refreshLists();
            })
          }
          onRemoveItem={(id, itemId) =>
            void removeFromJoidbList(id, itemId).then(refreshLists)
          }
          onMoveItem={(id, from, to) =>
            void moveInJoidbList(id, from, to).then(refreshLists)
          }
          onPlay={openFromList}
          onStartRun={reading.requestStartRun}
        />
        {startPrompt}
      </>
    );
  }

  return (
    <>
      <JoidbBrowse
        tab={tab}
        items={items}
        loading={loading}
        error={error}
        query={query}
        recsHasMore={recsHasMore}
        catalogPage={page}
        catalogPages={pages}
        savedIds={savedIds}
        lists={lists}
        busyIds={favSave.busyIds}
        picker={picker}
        onQuery={setQuery}
        onSearch={() => {
          setPage(1);
          setCommitted(query.trim());
        }}
        onLoadMore={loadMore}
        onOpen={(video) => setOpen({ video, playing: false })}
        onToggleSave={toggleSave}
        onOpenLists={setPicker}
        onClosePicker={() => setPicker(null)}
        onToggleList={(listId) =>
          picker
            ? void toggleInJoidbList(listId, picker).then(refreshLists)
            : undefined
        }
        onCreateList={(name) =>
          picker
            ? void createJoidbList(name).then(async (list) => {
                await addToJoidbList(list.id, picker);
                await refreshLists();
              })
            : undefined
        }
      />
      {startPrompt}
    </>
  );
}
