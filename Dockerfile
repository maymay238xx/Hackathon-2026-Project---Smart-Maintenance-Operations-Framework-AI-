# Stage 1 — React build
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY triage-dashboard/package*.json ./
RUN npm install --silent

COPY triage-dashboard/ ./

ARG VITE_API_URL
ARG VITE_REDIRECT_URI
ARG VITE_ENTRA_TENANT_ID
ARG VITE_ENTRA_CLIENT_ID
ARG VITE_ENTRA_SCOPE

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_REDIRECT_URI=$VITE_REDIRECT_URI
ENV VITE_ENTRA_TENANT_ID=$VITE_ENTRA_TENANT_ID
ENV VITE_ENTRA_CLIENT_ID=$VITE_ENTRA_CLIENT_ID
ENV VITE_ENTRA_SCOPE=$VITE_ENTRA_SCOPE

RUN npm run build


# Stage 2 — Python + FastAPI + ODBC
FROM mcr.microsoft.com/devcontainers/python:3.11

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg2 ca-certificates unixodbc-dev gcc g++ \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
       | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" \
       > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./
COPY *.csv ./
COPY manuals/ ./manuals/

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/dist ./static

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]