import * as React from "react";

export function Table({ children }) {
  return <table className="w-full border-collapse">{children}</table>;
}
export function TableHeader({ children }) {
  return <thead className="bg-gray-100">{children}</thead>;
}
export function TableRow({ children }) {
  return <tr className="border-b">{children}</tr>;
}
export function TableHead({ children }) {
  return <th className="text-left px-2 py-1">{children}</th>;
}
export function TableBody({ children }) {
  return <tbody>{children}</tbody>;
}
export function TableCell({ children }) {
  return <td className="px-2 py-1">{children}</td>;
}
