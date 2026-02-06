import * as React from "react";

export const Button = React.forwardRef(
  ({ className = "", variant = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";
    const variants = {
      default: "bg-blue-600 text-white hover:bg-blue-700",
      destructive: "bg-red-600 text-white hover:bg-red-700",
      outline: "border border-gray-300 hover:bg-gray-100",
      secondary: "bg-gray-200 text-black hover:bg-gray-300"
    };
    const finalClass = `${base} ${variants[variant] || variants.default} ${className}`;
    return <button ref={ref} className={finalClass} {...props} />;
  }
);
Button.displayName = "Button";
