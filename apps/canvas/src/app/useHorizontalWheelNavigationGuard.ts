import { useEffect } from "react";

type WheelDirection = Pick<WheelEvent, "cancelable" | "deltaX" | "deltaY">;

export const shouldPreventHorizontalNavigation = ({
  cancelable,
  deltaX,
  deltaY,
}: WheelDirection): boolean =>
  cancelable && Math.abs(deltaX) > Math.abs(deltaY);

export const useHorizontalWheelNavigationGuard = (): void => {
  useEffect(() => {
    const preventHorizontalNavigation = (event: WheelEvent) => {
      if (shouldPreventHorizontalNavigation(event)) {
        event.preventDefault();
      }
    };

    window.addEventListener("wheel", preventHorizontalNavigation, {
      capture: true,
      passive: false,
    });

    return () => {
      window.removeEventListener("wheel", preventHorizontalNavigation, {
        capture: true,
      });
    };
  }, []);
};
