import { NextRequest, NextResponse } from 'next/server';

interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function GET(request: NextRequest) {
  // Get query parameters
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'BTCUSDT';
  const interval = searchParams.get('interval') || '1m';
  const limit = searchParams.get('limit') || '500';

  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();

    const formattedData: KlineData[] = data.map(
      ([timestamp, open, high, low, close, volume]: any[]) => ({
        timestamp: Number(timestamp),
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
        volume: parseFloat(volume),
      })
    );

    return NextResponse.json(formattedData);
  } catch (error) {
    console.error('Error fetching market data:', error);
    return NextResponse.json([], { status: 500 });
  }
} 