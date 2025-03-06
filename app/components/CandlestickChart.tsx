"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

// Import ApexCharts dynamically to avoid SSR issues
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

// Types
interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface WebSocketMessage {
  k: {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean; // Whether this kline is closed
  };
}

// Fetch market data
const fetchMarketData = async (
  symbol: string = "BTCUSDT",
  interval: string = "1m"
): Promise<KlineData[]> => {
  console.log(`Fetching market data for ${symbol} with interval ${interval}`);

  try {
    const response = await fetch(
      `/api/market?symbol=${symbol}&interval=${interval}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error (${response.status}):`, errorText);
      throw new Error(
        `Failed to fetch market data: ${response.status} ${response.statusText}`
      );
    }

    const data: KlineData[] = await response.json();
    console.log(`Received ${data.length} candles from API`);

    if (!data || data.length === 0) {
      throw new Error("No data received from API");
    }

    return data;
  } catch (error) {
    console.error("Error in fetchMarketData:", error);
    throw error;
  }
};

const CandlestickChart = () => {
  // State for current price and connection status
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [selectedInterval, setSelectedInterval] = useState("1m");
  const [wsRef, setWsRef] = useState<WebSocket | null>(null);

  // State for chart data
  const [candlestickData, setCandlestickData] = useState<any[]>([]);
  const [volumeData, setVolumeData] = useState<any[]>([]);
  const [rsiData, setRsiData] = useState<any[]>([]);
  const [sma20Data, setSma20Data] = useState<any[]>([]);
  const [sma50Data, setSma50Data] = useState<any[]>([]);

  // Fetch initial data
  const {
    data: marketData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["marketData", selectedSymbol, selectedInterval],
    queryFn: () => fetchMarketData(selectedSymbol, selectedInterval),
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000, // 1 minute
    retry: 3,
    retryDelay: 1000,
  });

  // Process market data for charts
  useEffect(() => {
    if (!marketData) return;

    console.log(`Processing ${marketData.length} candles for charts`);

    // Format data for candlestick chart
    const ohlc = marketData.map((candle) => ({
      x: new Date(candle.timestamp),
      y: [candle.open, candle.high, candle.low, candle.close],
    }));

    // Format data for volume chart
    const volume = marketData.map((candle) => ({
      x: new Date(candle.timestamp),
      y: candle.volume,
      fillColor: candle.close >= candle.open ? "#26a69a" : "#ef5350",
    }));

    // Calculate SMA 20
    const sma20 = [];
    for (let i = 19; i < marketData.length; i++) {
      let sum = 0;
      for (let j = 0; j < 20; j++) {
        sum += marketData[i - j].close;
      }
      sma20.push({
        x: new Date(marketData[i].timestamp),
        y: sum / 20,
      });
    }

    // Calculate SMA 50
    const sma50 = [];
    for (let i = 49; i < marketData.length; i++) {
      let sum = 0;
      for (let j = 0; j < 50; j++) {
        sum += marketData[i - j].close;
      }
      sma50.push({
        x: new Date(marketData[i].timestamp),
        y: sum / 50,
      });
    }

    // Calculate RSI
    const rsi = calculateRSI(marketData, 14);

    // Update state
    setCandlestickData(ohlc);
    setVolumeData(volume);
    setSma20Data(sma20);
    setSma50Data(sma50);
    setRsiData(rsi);

    // Update current price
    if (marketData.length > 0) {
      setCurrentPrice(marketData[marketData.length - 1].close);
    }
  }, [marketData]);

  // Calculate RSI
  const calculateRSI = (data: KlineData[], period: number = 14): any[] => {
    if (data.length <= period) {
      return [];
    }

    // Calculate price changes
    const changes: number[] = [];
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i].close - data[i - 1].close);
    }

    // Calculate average gains and losses
    let avgGain = 0;
    let avgLoss = 0;

    // First RSI value
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        avgGain += changes[i];
      } else {
        avgLoss += Math.abs(changes[i]);
      }
    }

    avgGain /= period;
    avgLoss /= period;

    const result: any[] = [];

    // Calculate first RSI
    let rs = avgGain / (avgLoss === 0 ? 0.001 : avgLoss); // Avoid division by zero
    let rsiValue = 100 - 100 / (1 + rs);

    result.push({
      x: new Date(data[period].timestamp),
      y: rsiValue,
    });

    // Calculate rest of RSI values
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rs = avgGain / (avgLoss === 0 ? 0.001 : avgLoss);
      rsiValue = 100 - 100 / (1 + rs);

      result.push({
        x: new Date(data[i + 1].timestamp),
        y: rsiValue,
      });
    }

    return result;
  };

  // Connect to WebSocket
  useEffect(() => {
    // Close existing connection
    if (wsRef) {
      wsRef.close();
      setIsConnected(false);
      setWsRef(null);
    }

    try {
      // Create new WebSocket connection
      const symbol = selectedSymbol.toLowerCase();
      const interval = selectedInterval;
      const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`;

      console.log(`Connecting to WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
      };

      ws.onclose = (event) => {
        console.log("WebSocket disconnected:", event);
        setIsConnected(false);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          if (message.k) {
            const { t, o, h, l, c, v, x } = message.k;

            // Update current price
            const closePrice = parseFloat(c);
            setCurrentPrice(closePrice);

            // Update candlestick data
            const timestamp = new Date(t);
            const openPrice = parseFloat(o);
            const highPrice = parseFloat(h);
            const lowPrice = parseFloat(l);
            const volume = parseFloat(v);

            // If this is a new candle, add it to the data
            if (x && candlestickData.length > 0) {
              // Refresh data when candle closes
              refetch();
            }
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };

      setWsRef(ws);
    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
      setIsConnected(false);
    }

    return () => {
      if (wsRef) {
        wsRef.close();
        setIsConnected(false);
        setWsRef(null);
      }
    };
  }, [selectedSymbol, selectedInterval, refetch]);

  // Handle symbol change
  const handleSymbolChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSymbol(event.target.value);
  };

  // Handle interval change
  const handleIntervalChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setSelectedInterval(event.target.value);
  };

  // Chart options
  const candlestickOptions = {
    chart: {
      type: "candlestick",
      height: 400,
      id: "candles",
      toolbar: {
        autoSelected: "pan",
        show: true,
      },
      zoom: {
        enabled: true,
      },
    },
    title: {
      text: "Price Chart",
      align: "left",
    },
    xaxis: {
      type: "datetime",
      labels: {
        datetimeUTC: false,
      },
    },
    yaxis: {
      tooltip: {
        enabled: true,
      },
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: "#26a69a",
          downward: "#ef5350",
        },
      },
    },
    tooltip: {
      enabled: true,
      shared: true,
      custom: ({ seriesIndex, dataPointIndex, w }: any) => {
        const o = w.globals.seriesCandleO[seriesIndex][dataPointIndex];
        const h = w.globals.seriesCandleH[seriesIndex][dataPointIndex];
        const l = w.globals.seriesCandleL[seriesIndex][dataPointIndex];
        const c = w.globals.seriesCandleC[seriesIndex][dataPointIndex];
        const date = new Date(w.globals.seriesX[seriesIndex][dataPointIndex]);

        return `
          <div class="apexcharts-tooltip-candlestick">
            <div>${format(date, "MMM dd, yyyy HH:mm")}</div>
            <div>Open: ${o.toFixed(2)}</div>
            <div>High: ${h.toFixed(2)}</div>
            <div>Low: ${l.toFixed(2)}</div>
            <div>Close: ${c.toFixed(2)}</div>
          </div>
        `;
      },
    },
  };

  const volumeOptions = {
    chart: {
      type: "bar",
      height: 150,
      brush: {
        enabled: true,
        target: "candles",
      },
      selection: {
        enabled: true,
        xaxis: {
          min:
            candlestickData.length > 0
              ? candlestickData[0].x.getTime()
              : undefined,
          max:
            candlestickData.length > 0
              ? candlestickData[candlestickData.length - 1].x.getTime()
              : undefined,
        },
      },
    },
    title: {
      text: "Volume",
      align: "left",
    },
    xaxis: {
      type: "datetime",
      labels: {
        datetimeUTC: false,
      },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => {
          return val.toFixed(0);
        },
      },
    },
  };

  const rsiOptions = {
    chart: {
      type: "line",
      height: 150,
      toolbar: {
        show: false,
      },
    },
    title: {
      text: "RSI (14)",
      align: "left",
    },
    xaxis: {
      type: "datetime",
      labels: {
        datetimeUTC: false,
      },
    },
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 5,
      labels: {
        formatter: (val: number) => {
          return val.toFixed(0);
        },
      },
    },
    stroke: {
      width: 2,
    },
    colors: ["#9C27B0"],
    annotations: {
      yaxis: [
        {
          y: 30,
          borderColor: "#4CAF50",
          label: {
            text: "Oversold",
            style: {
              color: "#fff",
              background: "#4CAF50",
            },
          },
        },
        {
          y: 70,
          borderColor: "#FF5252",
          label: {
            text: "Overbought",
            style: {
              color: "#fff",
              background: "#FF5252",
            },
          },
        },
      ],
    },
  };

  // Series data
  const candlestickSeries = [
    {
      name: "Price",
      data: candlestickData,
    },
  ];

  const indicatorSeries = [
    {
      name: "SMA 20",
      type: "line",
      data: sma20Data,
      color: "#2196F3",
    },
    {
      name: "SMA 50",
      type: "line",
      data: sma50Data,
      color: "#FF9800",
    },
  ];

  const volumeSeries = [
    {
      name: "Volume",
      data: volumeData,
    },
  ];

  const rsiSeries = [
    {
      name: "RSI",
      data: rsiData,
    },
  ];

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">{selectedSymbol} Chart</h2>

        <div className="flex space-x-4">
          <select
            value={selectedSymbol}
            onChange={handleSymbolChange}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="BTCUSDT">BTC/USDT</option>
            <option value="ETHUSDT">ETH/USDT</option>
            <option value="BNBUSDT">BNB/USDT</option>
            <option value="SOLUSDT">SOL/USDT</option>
            <option value="ADAUSDT">ADA/USDT</option>
          </select>

          <select
            value={selectedInterval}
            onChange={handleIntervalChange}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1m">1 minute</option>
            <option value="5m">5 minutes</option>
            <option value="15m">15 minutes</option>
            <option value="1h">1 hour</option>
            <option value="4h">4 hours</option>
            <option value="1d">1 day</option>
          </select>

          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Current Price */}
      {currentPrice && (
        <div className="mb-6 flex items-center">
          <span className="text-3xl font-bold">
            $
            {currentPrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="ml-2 text-sm text-gray-500">
            {format(new Date(), "MMM dd, yyyy HH:mm:ss")}
          </span>
          <span
            className={`ml-4 px-2 py-1 rounded-full text-xs ${
              isConnected
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {isConnected ? "● Live" : "● Disconnected"}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="text-red-500 text-center py-10">
          Error loading chart data. Please try again.
        </div>
      ) : (
        <>
          {/* Main Chart */}
          <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
            {typeof window !== "undefined" && (
              <ReactApexChart
                options={{
                  ...candlestickOptions,
                  annotations: {
                    xaxis: [],
                  },
                }}
                series={candlestickSeries}
                type="candlestick"
                height={400}
              />
            )}

            {/* Indicators */}
            {typeof window !== "undefined" && (
              <ReactApexChart
                options={{
                  ...candlestickOptions,
                  chart: {
                    ...candlestickOptions.chart,
                    id: "indicators",
                    type: "line",
                    height: 400,
                    toolbar: {
                      show: false,
                    },
                  },
                  tooltip: {
                    enabled: false,
                  },
                  legend: {
                    show: true,
                  },
                }}
                series={indicatorSeries}
                type="line"
                height={0}
              />
            )}
          </div>

          {/* RSI Chart */}
          <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
            {typeof window !== "undefined" && (
              <ReactApexChart
                options={rsiOptions}
                series={rsiSeries}
                type="line"
                height={150}
              />
            )}
          </div>

          {/* Volume Chart */}
          <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
            {typeof window !== "undefined" && (
              <ReactApexChart
                options={volumeOptions}
                series={volumeSeries}
                type="bar"
                height={150}
              />
            )}
          </div>
        </>
      )}

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex items-center">
          <div className="w-4 h-4 bg-[#26a69a] mr-2"></div>
          <span>Bullish Candle</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-[#ef5350] mr-2"></div>
          <span>Bearish Candle</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-[#2196F3] mr-2"></div>
          <span>SMA 20</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-[#FF9800] mr-2"></div>
          <span>SMA 50</span>
        </div>
      </div>
    </div>
  );
};

export default CandlestickChart;
