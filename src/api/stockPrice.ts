export interface StockQuote {
  ticker: string
  price: number
  currency: string
  name?: string
}

// Yahoo Finance v8 chart API — works from browser in most cases
// Thai stocks use .BK suffix (e.g. CPALL.BK), US stocks use plain ticker (AAPL)
async function fetchYahooQuote(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const json = await res.json()
    const meta = json?.chart?.result?.[0]?.meta
    return meta?.regularMarketPrice ?? meta?.previousClose ?? null
  } catch {
    return null
  }
}

export async function fetchStockPrices(tickers: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {}
  await Promise.all(
    tickers.map(async ticker => {
      const price = await fetchYahooQuote(ticker)
      if (price !== null) results[ticker] = price
    })
  )
  return results
}
