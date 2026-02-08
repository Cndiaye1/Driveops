import React, { useEffect, useRef } from "react";
import { useDriveStore } from "./store/useDriveStore";
import Setup from "./components/Setup";
import Cockpit from "./components/Cockpit";

export default function App() {
  const screen = useDriveStore((s) => s.screen);
  const tick = useDriveStore((s) => s.tick);

  const intervalRef = useRef(null);

  useEffect(() => {
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      tick();
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [tick]);

  return screen === "cockpit" ? <Cockpit /> : <Setup />;
}
