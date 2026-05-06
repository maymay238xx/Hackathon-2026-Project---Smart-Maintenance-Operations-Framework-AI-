

# Stage 1 — React build
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY triage-dashboard/package*.json ./
RUN npm install --silent

COPY triage-dashboard/ ./


ENV VITE_ENTRA_CLIENT_ID=31c4f1c1-8c09-41cd-b831-73123391265e
ENV VITE_ENTRA_TENANT_ID=baf5b083-4c53-493a-8af7-a6ae9812014c
ENV VITE_ENTRA_SCOPE=api://9b1ff49f-dd34-4443-adaa-55e55c767e9b/user_impersonation
ENV VITE_API_URL=https://lavenir-app.wittyriver-1002da0d.uksouth.azurecontainerapps.io
ENV VITE_REDIRECT_URI=https://lavenir-app.wittyriver-1002da0d.uksouth.azurecontainerapps.io

RUN npm run build
# Output: /app/frontend/dist


# Stage 2 — Python + FastAPI + ODBC 
FROM python:3.11-slim

WORKDIR /app

# System dependencies: ODBC Driver 18 for Fabric SQL endpoint 
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg2 ca-certificates unixodbc-dev gcc g++ \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
       | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" \
       > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Python dependencies 
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source files 
COPY *.py ./

# CSV fallback files (used if Fabric is unavailable) 
COPY *.csv ./

# PDF manuals (downloaded from Fabric by download_pdfs.py before build) 
# If ./manuals/ doesn't exist the build will warn but continue
COPY manuals/ ./manuals/

# Built React frontend from Stage 1 
COPY --from=frontend-build /app/frontend/dist ./static

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]