import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

// A square slip with its corner turned: a note kept, where the pen read as
// "edit this" and a tall page already means an article. Drawn in the
// itshover icons' manner: pointed at, the corner folds again and the slip lifts.
const NoteIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      animate(".note-slip", { y: [0, -1.5, 0], rotate: [0, -4, 0] }, { duration: 0.35, ease: "easeOut" });
      await animate(".note-fold", { pathLength: [0, 1] }, { duration: 0.3, ease: "easeOut" });
    }, [animate]);

    const stop = useCallback(async () => {
      animate(".note-fold", { pathLength: 1 }, { duration: 0.2 });
      animate(".note-slip", { y: 0, rotate: 0 }, { duration: 0.2 });
    }, [animate]);

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <motion.svg
        ref={scope}
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
        onHoverStart={start}
        onHoverEnd={stop}
      >
        <motion.g className="note-slip" style={{ transformOrigin: "12px 12px" }}>
          <path d="M21 9a2.4 2.4 0 0 0 -.706 -1.706l-3.588 -3.588a2.4 2.4 0 0 0 -1.706 -.706h-10a2 2 0 0 0 -2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2 -2z" />
          <motion.path d="M15 3v5a1 1 0 0 0 1 1h5" className="note-fold" />
        </motion.g>
      </motion.svg>
    );
  },
);

NoteIcon.displayName = "NoteIcon";
export default NoteIcon;
