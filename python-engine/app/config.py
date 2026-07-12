from pydantic import BaseModel
import os


class Settings(BaseModel):
    service_name: str = "TradePilot Python Analysis Engine"
    environment: str = os.getenv("PYTHON_ENGINE_ENV", "development")
    log_level: str = os.getenv("PYTHON_ENGINE_LOG_LEVEL", "INFO")
    paper_trading_only: bool = True
    real_trading_enabled: bool = False
    max_open_trades: int = int(os.getenv("PYTHON_ENGINE_MAX_OPEN_TRADES", "3"))
    max_daily_loss_percent: float = float(os.getenv("PYTHON_ENGINE_MAX_DAILY_LOSS_PERCENT", "3"))
    max_weekly_loss_percent: float = float(os.getenv("PYTHON_ENGINE_MAX_WEEKLY_LOSS_PERCENT", "6"))


settings = Settings()
