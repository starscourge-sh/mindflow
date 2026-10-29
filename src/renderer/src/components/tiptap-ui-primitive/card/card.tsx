"use client"

import { forwardRef } from "react"
import { cn } from "@/lib/tiptap-utils"
import "@/components/tiptap-ui-primitive/card/card.scss"

const Card = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("tiptap-card", className)} {...props} />
  }
)
Card.displayName = "Card"


const CardBody = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("tiptap-card-body", className)} {...props} />
    )
  }
)
CardBody.displayName = "CardBody"

const CardItemGroup = forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    orientation?: "horizontal" | "vertical"
  }
>(({ className, orientation = "vertical", ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-orientation={orientation}
      className={cn("tiptap-card-item-group", className)}
      {...props}
    />
  )
})
CardItemGroup.displayName = "CardItemGroup"

export { Card, CardBody, CardItemGroup }
