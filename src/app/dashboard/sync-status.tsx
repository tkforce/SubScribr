"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SyncStatus = {
  isSyncing: boolean;
  setSyncing: (syncing: boolean) => void;
};

const SyncStatusContext = createContext<SyncStatus>({
  isSyncing: false,
  setSyncing: () => {},
});

// Shares "a sync is running" between AutoSync, which owns the request, and the
// sections that have to decide whether their zeros are facts or placeholders.
export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const [isSyncing, setSyncing] = useState(false);
  const value = useMemo(() => ({ isSyncing, setSyncing }), [isSyncing]);
  return (
    <SyncStatusContext.Provider value={value}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncStatusContext);
}

// Swaps a section for a skeleton while a sync runs, but only when the section
// has nothing real to show.
//
// The distinction matters: for a user who already has subscriptions, last
// sync's numbers are merely dated, and hiding them behind a skeleton would
// take away information they already had (stale-while-revalidate). For a user
// with none, "NT$ 0" is not a dated fact — it is a conclusion that has not
// been reached yet, sitting next to a spinner that says otherwise.
//
// `children` is server-rendered and passed in, so StatRow and SubscriptionList
// stay server components.
export function SyncAware({
  empty,
  fallback,
  children,
}: {
  empty: boolean;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const { isSyncing } = useSyncStatus();
  return isSyncing && empty ? <>{fallback}</> : <>{children}</>;
}
