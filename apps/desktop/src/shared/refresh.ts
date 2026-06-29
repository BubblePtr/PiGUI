import { useEffect } from "react";
import { onWindowFocusChanged } from "@/shared/runtime";

export function useRefreshOnWindowFocus(refetch: () => unknown) {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    onWindowFocusChanged(refetch)
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }

        unlisten = nextUnlisten;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refetch]);
}
