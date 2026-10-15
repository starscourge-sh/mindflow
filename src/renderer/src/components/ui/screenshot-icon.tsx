import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

/** A screen with a frame's corners closing in on it, as a screenshot is aimed. */
const ScreenshotIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(".corners", { scale: 0.86 }, { duration: 0.25, ease: "easeOut" });
    };
    const stop = () => {
      animate(".corners", { scale: 1 }, { duration: 0.2, ease: "easeInOut" });
    };

    useImperativeHandle(ref, () => ({ startAnimation: start, stopAnimation: stop }));

    return (
      <motion.svg
        ref={scope}
        onHoverStart={start}
        onHoverEnd={stop}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`cursor-pointer ${className}`}
      >
        <motion.path className="corners" style={{ transformOrigin: "12px 12px" }} d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
        <rect x="7.5" y="8" width="9" height="6.5" rx="1" />
        <path d="M10.5 17h3" />
      </motion.svg>
    );
  },
);

ScreenshotIcon.displayName = "ScreenshotIcon";

export default ScreenshotIcon;
