"use client";

import dynamic from "next/dynamic";

const CandlestickChart = dynamic(() => import("./CandlestickChart"), {
  ssr: false,
});

export default function ClientWrapper() {
  return <CandlestickChart />;
}
