import { HubSearchDock } from "../../components/HubSearchDock";
import type { ContentTab } from "../../lib/contentHub";
import { listedJoidbIds, type JoidbPlayList } from "../../lib/joidb/joidbLists";
import type { JoidbVideo } from "../../lib/joidb/parseCatalog";
import { JoidbFeed } from "./JoidbFeed";
import { JoidbListPicker } from "./JoidbListPicker";
import "./joidb.css";

type Props = {
  tab: ContentTab;
  items: JoidbVideo[];
  loading: boolean;
  error: string | null;
  query: string;
  recsHasMore: boolean;
  catalogPage: number;
  catalogPages: number;
  savedIds: ReadonlySet<string>;
  lists: JoidbPlayList[];
  busyIds?: ReadonlySet<string>;
  picker: JoidbVideo | null;
  onQuery: (value: string) => void;
  onSearch: () => void;
  onLoadMore: () => void;
  onOpen: (video: JoidbVideo) => void;
  onToggleSave: (video: JoidbVideo) => void;
  onOpenLists: (video: JoidbVideo) => void;
  onClosePicker: () => void;
  onToggleList: (listId: string) => void;
  onCreateList: (name: string) => void;
};

export function JoidbBrowse({
  tab,
  items,
  loading,
  error,
  query,
  recsHasMore,
  catalogPage,
  catalogPages,
  savedIds,
  lists,
  busyIds,
  picker,
  onQuery,
  onSearch,
  onLoadMore,
  onOpen,
  onToggleSave,
  onOpenLists,
  onClosePicker,
  onToggleList,
  onCreateList,
}: Props) {
  return (
    <div className="joidb-hub">
      {tab === "search" ? (
        <HubSearchDock peek="Поиск JOI Database">
          <form
            className="joidb-search"
            onSubmit={(e) => {
              e.preventDefault();
              onSearch();
            }}
          >
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="поиск видео…"
            />
            <button type="submit" className="btn-primary">
              Искать
            </button>
          </form>
        </HubSearchDock>
      ) : null}
      <JoidbFeed
        items={items}
        loading={loading}
        hasMore={
          loading
            ? false
            : tab === "recs"
              ? recsHasMore
              : tab === "newest" || tab === "search"
                ? catalogPage < catalogPages
                : false
        }
        emptyHint={
          tab === "library"
            ? "Избранное joidb пусто — сердечко на карточке."
            : "Нет видео."
        }
        status={error}
        savedIds={savedIds}
        listedIds={listedJoidbIds(lists)}
        busyIds={busyIds}
        onLoadMore={onLoadMore}
        onOpen={onOpen}
        onToggleSave={onToggleSave}
        onOpenLists={onOpenLists}
      />
      {picker ? (
        <JoidbListPicker
          video={picker}
          lists={lists}
          onClose={onClosePicker}
          onToggle={onToggleList}
          onCreate={onCreateList}
        />
      ) : null}
    </div>
  );
}
