import * as React from "react";
import { cn } from "../../lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
};

export const buttonVariants = {
  primary:
    "bg-indigo-600 text-white border border-indigo-700 hover:bg-indigo-700",
  outline:
    "border border-gray-300 hover:border-gray-400 bg-transparent hover:bg-gray-100 dark:bg-transparent dark:border-gray-700 dark:hover:bg-gray-800",
  ghost: "hover:bg-gray-50 dark:hover:bg-gray-800",
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-5 py-3",
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900",
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-900",
        className
      )}
      {...props}
    />
  );
}
