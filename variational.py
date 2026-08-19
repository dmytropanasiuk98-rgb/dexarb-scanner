import asyncio
import aiohttp
import json
import logging
from typing import Dict, Tuple, Optional, Set

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Variational")

VARIATIONAL_STATS_URL = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats"

class VariationalClient:
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.prices: Dict[str, Tuple[float, float]] = {}  # symbol -> (bid, ask)
        self.funding_rates: Dict[str, float] = {}  # symbol -> funding_rate_pct
        self.running = False

    async def start(self):
        """Starts background polling for Variational stats."""
        self.running = True
        self.session = aiohttp.ClientSession(headers={'User-Agent': 'Mozilla/5.0'})
        asyncio.create_task(self._poll_loop())

    async def stop(self):
        """Stops the client."""
        self.running = False
        if self.session:
            await self.session.close()

    async def _poll_loop(self):
        while self.running:
            try:
                if self.session:
                    async with self.session.get(VARIATIONAL_STATS_URL, timeout=5) as r:
                        if r.status == 200:
                            data = await r.json()
                            listings = data.get("listings", [])
                            new_prices = {}
                            new_funding = {}
                            for item in listings:
                                tkr = item.get("ticker")
                                quotes = item.get("quotes", {})
                                q_obj = quotes.get("base") or quotes.get("size_1k") or {}
                                bid_str = q_obj.get("bid") or item.get("mark_price")
                                ask_str = q_obj.get("ask") or item.get("mark_price")
                                fr_str = item.get("funding_rate")
                                if tkr:
                                    sym_upper = tkr.upper()
                                    if bid_str and ask_str:
                                        try:
                                            bid = float(bid_str)
                                            ask = float(ask_str)
                                            if bid > 0 and ask > 0:
                                                new_prices[sym_upper] = (bid, ask)
                                        except ValueError:
                                            pass
                                    if fr_str is not None:
                                        try:
                                            new_funding[sym_upper] = float(fr_str) * 100.0
                                        except ValueError:
                                            pass
                            if new_prices:
                                self.prices = new_prices
                            if new_funding:
                                self.funding_rates = new_funding
            except Exception as e:
                logger.error(f"Variational poll error: {e}")
            await asyncio.sleep(2.5)  # Respect rate limit (10 req/10s)

    def get_price(self, symbol: str) -> Tuple[float, float]:
        """Returns (best_bid, best_ask) from live RAM cache."""
        return self.prices.get(symbol.upper(), (0.0, 0.0))

    def get_funding(self, symbol: str) -> float:
        """Returns funding rate percentage."""
        return self.funding_rates.get(symbol.upper(), 0.0)

    def get_symbols(self) -> Set[str]:
        """Returns set of available symbols."""
        return set(self.prices.keys())

client = VariationalClient()
