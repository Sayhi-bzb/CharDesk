import * as React from "react"

const MOBILE_BREAKPOINT = 768
export const SIDEBAR_AUTO_COLLAPSE_BREAKPOINT = 1200

function useMaxWidthQuery(breakpoint: number) {
  const [matches, setMatches] = React.useState(() => {
    if (typeof window === "undefined") return false
    return window.innerWidth < breakpoint
  })

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => {
      setMatches(window.innerWidth < breakpoint)
    }
    mql.addEventListener("change", onChange)
    setMatches(window.innerWidth < breakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return !!matches
}

export function useIsMobile() {
  return useMaxWidthQuery(MOBILE_BREAKPOINT)
}

export function useShouldAutoCollapseSidebar() {
  return useMaxWidthQuery(SIDEBAR_AUTO_COLLAPSE_BREAKPOINT)
}

export function useSidebarAutoCollapseSignal() {
  const shouldAutoCollapseSidebar = useShouldAutoCollapseSidebar()
  const previousShouldAutoCollapseSidebar = React.useRef(
    shouldAutoCollapseSidebar
  )
  const [signal, setSignal] = React.useState(() =>
    shouldAutoCollapseSidebar ? 1 : 0
  )

  React.useEffect(() => {
    if (!previousShouldAutoCollapseSidebar.current && shouldAutoCollapseSidebar) {
      setSignal((currentSignal) => currentSignal + 1)
    }
    previousShouldAutoCollapseSidebar.current = shouldAutoCollapseSidebar
  }, [shouldAutoCollapseSidebar])

  return signal
}
