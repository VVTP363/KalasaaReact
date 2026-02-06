// src/components/InfoTooltip.jsx
import React from "react";

const InfoTooltip = ({ text }) => {
  if (!text) return null;
  return (
    <span
      style={{
        marginLeft: "0.35em",
        cursor: "help",
        fontSize: "0.9em",
        opacity: 0.8,
      }}
      title={text}
    >
      ℹ️
    </span>
  );
};

export default InfoTooltip;
