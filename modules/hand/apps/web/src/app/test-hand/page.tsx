"use client";

import dynamic from "next/dynamic";

const HandTracker = dynamic(() => import("./hand-tracker"), { ssr: false });

export default function TestHandPage() {
  return <HandTracker />;
}
