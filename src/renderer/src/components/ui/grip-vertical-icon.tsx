import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion } from "motion/react";
import { useBeat } from "./beat";

/** Notion's handle: two columns of three dots, a grip to pick a block up by. */
const ROWS = [5, 12, 19] as const;
const dot = (x: number, y: number): string => `M${x} ${y}m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0`;

const GripVerticalIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useBeat(0.5);

    // Each row lifts in turn, top to bottom, as if the grip were drawn in.
    const start = useCallback(async () => {
      ROWS.forEach((_, row) =>
        animate(`.grip-row-${row}`, { scale: [1, 1.3, 1] }, { duration: 0.3, delay: row * 0.08, ease: "easeOut" }),
      );
    }, [animate]);

    const stop = useCallback(() => {
      animate(".grip-dot", { scale: 1 }, { duration: 0.2, ease: "easeInOut" });
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
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        {ROWS.flatMap((y, row) =>
          [9, 15].map((x) => (
            <motion.path key={`${x}-${y}`} d={dot(x, y)} className={`grip-dot grip-row-${row}`} style={{ transformOrigin: `${x}px ${y}px` }} />
          )),
        )}
      </motion.svg>
    );
  },
);

GripVerticalIcon.displayName = "GripVerticalIcon";
export default GripVerticalIcon;
