import * as React from "react";

export function Dialog({ open, onOpenChange, children }) {
  return open ? <div className="dialog-backdrop">{children}</div> : null;
}

export function DialogTrigger({ children }) {
  return children;
}

export function DialogContent({ children }) {
  return (
    <div className="dialog-content bg-white p-4 rounded shadow-md max-w-lg mx-auto mt-20">
      {children}
    </div>
  );
}

export function DialogHeader({ children }) {
  return <div className="dialog-header mb-4">{children}</div>;
}

export function DialogTitle({ children }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}

export function DialogFooter({ children, className = "" }) {
  return <div className={`dialog-footer mt-4 flex gap-2 ${className}`}>{children}</div>;
}
