import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion } from "motion/react";
import { useBeat } from "./beat";

const BrightnessDownIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useBeat(0.83);

    const start = async () => {
      animate(
        ".sun-center",
        { scale: [1, 0.8, 1] },
        { duration: 0.3, ease: "easeInOut" },
      );
      animate(
        ".sun-rays",
        { opacity: [1, 0.4, 1] },
        { duration: 0.3, ease: "easeInOut" },
      );
    };

    const stop = () => {
      animate(".sun-center", { scale: 1 }, { duration: 0.2, ease: "easeOut" });
      animate(".sun-rays", { opacity: 1 }, { duration: 0.2, ease: "easeOut" });
    };

    useImperativeHandle(ref, () => {
      return {
        startAnimation: start,
        stopAnimation: stop,
      };
    });

    const handleHoverStart = () => {
      start();
    };

    const handleHoverEnd = () => {
      stop();
    };

    return (
      <motion.div
        ref={scope}
        onHoverStart={handleHoverStart}
        onHoverEnd={handleHoverEnd}
        className={`inline-flex cursor-pointer items-center justify-center ${className}`}
      >
        <svg
          className="size-[inherit]"
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          // Its rays are dots well inside the square: framed closer, so it reads at sidebar size.
          viewBox="4 4 16 16"
          fill="none"
          stroke={color}
          strokeWidth={Number(strokeWidth) * (16 / 24)}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <motion.path
            className="sun-center"
            d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"
            style={{ transformOrigin: "center" }}
          />
          <motion.g className="sun-rays">
            <path d="M12 5l0 .01" />
            <path d="M17 7l0 .01" />
            <path d="M19 12l0 .01" />
            <path d="M17 17l0 .01" />
            <path d="M12 19l0 .01" />
            <path d="M7 17l0 .01" />
            <path d="M5 12l0 .01" />
            <path d="M7 7l0 .01" />
          </motion.g>
        </svg>
      </motion.div>
    );
  },
);

BrightnessDownIcon.displayName = "BrightnessDownIcon";

export default BrightnessDownIcon;
