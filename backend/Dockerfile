FROM python:3.12-slim

RUN pip install uv

WORKDIR /app

COPY pyproject.toml .
RUN uv sync

COPY . .

# Shell form so HOST/PORT from the env file are honoured. These services run with
# network_mode: host, so 0.0.0.0 here would publish the unauthenticated API to the
# whole network — the default stays on loopback.
CMD uv run uvicorn app.main:app --host ${HOST:-127.0.0.1} --port ${PORT:-8001} --reload
