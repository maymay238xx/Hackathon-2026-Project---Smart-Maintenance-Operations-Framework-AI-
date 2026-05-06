import os
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

FABRIC_ENDPOINT  = os.getenv("FABRIC_SQL_ENDPOINT", "")
FABRIC_DATABASE  = os.getenv("FABRIC_DATABASE", "Data")
FABRIC_WORKSPACE = os.getenv("FABRIC_WORKSPACE_ID", "")
TENANT_ID        = os.getenv("FABRIC_TENANT_ID", "")
CLIENT_ID        = os.getenv("FABRIC_CLIENT_ID", "")
CLIENT_SECRET    = os.getenv("FABRIC_CLIENT_SECRET", "")


FABRIC_ENABLED = all([FABRIC_ENDPOINT, FABRIC_DATABASE, TENANT_ID, CLIENT_ID, CLIENT_SECRET])

# CSV fallback paths (bundled inside the Docker image)
CSV_SENSOR_1   = "facilities_monitoring_output.csv"
CSV_SENSOR_2   = "fake_data.csv"
CSV_SENSOR_3   = "synthetic-HVAC-data.csv"
CSV_DEPARTMENT = "departments_services_contacts_v2.csv"


def _get_connection():
    """
    Open a pyodbc connection to the Fabric SQL Analytics Endpoint.
    Uses ActiveDirectoryServicePrincipal auth — no interactive login needed.
    Requires ODBC Driver 18 for SQL Server (installed in Dockerfile).
    """
    import pyodbc
    conn_str = (
        f"Driver={{ODBC Driver 18 for SQL Server}};"
        f"Server={FABRIC_ENDPOINT},1433;"
        f"Database={FABRIC_DATABASE};"
        f"Authentication=ActiveDirectoryServicePrincipal;"
        f"UID={CLIENT_ID};"
        f"PWD={CLIENT_SECRET};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=no;"
        f"Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)


def load_sensor_data() -> pd.DataFrame:
    """
    Load sensor telemetry.
    Production : Fabric SQL Analytics Endpoint → dbo.sensor_readings
    Fallback   : Local CSV files
    """
    if FABRIC_ENABLED:
        try:
            print("🔗 [FABRIC] Connecting to SQL Analytics Endpoint...")
            conn = _get_connection()
            df   = pd.read_sql("SELECT * FROM dbo.sensor_readings", conn)
            conn.close()
            df["timestamp"] = pd.to_datetime(df["timestamp"])
            print(f"✅ [FABRIC] Loaded {len(df)} sensor rows from Lakehouse")
            return df
        except Exception as e:
            print(f"⚠️  [FABRIC] Connection failed: {e}")
            print("   ↳ Falling back to local CSV files")


    print("📄 [CSV FALLBACK] Reading local CSV files...")
    frames = []
    for path in [CSV_SENSOR_1, CSV_SENSOR_2]:
        if os.path.exists(path):
            frames.append(pd.read_csv(path))

    if os.path.exists(CSV_SENSOR_3):
        df_hvac = pd.read_csv(CSV_SENSOR_3)
        df_hvac.columns = [c.lower() for c in df_hvac.columns]
        if "model_id" in df_hvac.columns and "equipment_id" not in df_hvac.columns:
            df_hvac = df_hvac.rename(columns={"model_id": "equipment_id"})
        frames.append(df_hvac)

    if not frames:
        raise RuntimeError("No sensor CSV files found. Check your project directory.")

    df = pd.concat(frames, ignore_index=True)
    df.columns = [c.lower() for c in df.columns]
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.drop_duplicates(subset=["equipment_id", "timestamp"])
    print(f"✅ [CSV] Loaded {len(df)} rows from local files")
    return df


def load_department_data() -> pd.DataFrame:
    """
    Load department / contact routing table.
    Production : Fabric → dbo.department_contacts
    Fallback   : Local CSV
    """
    if FABRIC_ENABLED:
        try:
            conn = _get_connection()
            df   = pd.read_sql("SELECT * FROM dbo.department_contacts", conn)
            conn.close()
            df.columns = [c.lower() for c in df.columns]
            print(f"✅ [FABRIC] Loaded {len(df)} department records")
            return df
        except Exception as e:
            print(f"⚠️  [FABRIC] Department data failed: {e}")
            print("   ↳ Falling back to CSV")

    df = pd.read_csv(CSV_DEPARTMENT)
    df.columns = [c.lower() for c in df.columns]
    return df


def write_audit_record(record: dict) -> bool:
    """
    Write a completed audit record to Fabric audit_log table.
    Creates the table if it doesn't exist.
    Returns True on success, False if Fabric unavailable.
    """
    if not FABRIC_ENABLED:
        return False
    try:
        conn   = _get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_log')
            CREATE TABLE dbo.audit_log (
                equipment_id    NVARCHAR(100),
                ticket_id       NVARCHAR(50),
                severity        NVARCHAR(50),
                record_type     NVARCHAR(50),
                department      NVARCHAR(100),
                dispatched_at   NVARCHAR(50),
                status          NVARCHAR(100),
                action_taken    NVARCHAR(MAX),
                logged_at       DATETIME DEFAULT GETDATE()
            )
        """)

        cursor.execute("""
            INSERT INTO dbo.audit_log
              (equipment_id, ticket_id, severity, record_type,
               department, dispatched_at, status, action_taken)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            record.get("equipment_id"),
            record.get("ticket_id"),
            record.get("severity"),
            record.get("record_type"),
            record.get("department"),
            record.get("dispatched_at"),
            record.get("status"),
            record.get("action_taken"),
        ))

        conn.commit()
        conn.close()
        print(f"✅ [FABRIC] Audit record written: {record.get('equipment_id')}")
        return True

    except Exception as e:
        print(f"⚠️  [FABRIC] Audit write failed: {e}")
        return False


def download_manuals(local_dir: str = "./manuals") -> int:
    """
    Download all PDFs from the Fabric Lakehouse Files/ section
    into a local directory. Called by download_pdfs.py.
    Returns count of files downloaded.
    """
    if not all([FABRIC_WORKSPACE, TENANT_ID, CLIENT_ID, CLIENT_SECRET]):
        print("⚠️  [FABRIC] Cannot download manuals — missing credentials")
        return 0

    try:
        from azure.identity import ClientSecretCredential
        from azure.storage.filedatalake import DataLakeServiceClient
    except ImportError:
        print("❌ Run: pip install azure-storage-file-datalake azure-identity")
        return 0

    Path(local_dir).mkdir(exist_ok=True)
    credential = ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET)
    svc        = DataLakeServiceClient(
        account_url="https://onelake.dfs.fabric.microsoft.com",
        credential=credential,
    )
    fs_client  = svc.get_file_system_client(FABRIC_WORKSPACE)
    base_path  = f"{FABRIC_DATABASE}.Lakehouse/Files"

    count = 0
    try:
        for item in fs_client.get_paths(path=base_path, recursive=True):
            name = Path(item.name).name
            if not name.endswith(".pdf"):
                continue
            local_path = Path(local_dir) / name
            if local_path.exists():
                print(f"  ⏭  {name} (already exists)")
                continue
            try:
                dl = fs_client.get_file_client(item.name).download_file()
                with open(local_path, "wb") as f:
                    dl.readinto(f)
                size_kb = local_path.stat().st_size // 1024
                print(f"  ✅ {name} ({size_kb} KB)")
                count += 1
            except Exception as e:
                print(f"  ❌ {name}: {e}")
    except Exception as e:
        print(f"❌ [FABRIC] Could not list files: {e}")

    return count


def health_check() -> dict:
    """Test Fabric connectivity. Called by the /health endpoint."""
    if not FABRIC_ENABLED:
        return {
            "fabric": "disabled",
            "reason": "Environment variables not set — using CSV fallback"
        }
    try:
        conn      = _get_connection()
        cursor    = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM dbo.sensor_readings")
        row_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM dbo.department_contacts")
        dept_count = cursor.fetchone()[0]
        conn.close()
        return {
            "fabric":      "connected",
            "endpoint":    FABRIC_ENDPOINT,
            "database":    FABRIC_DATABASE,
            "sensor_rows": row_count,
            "dept_rows":   dept_count,
        }
    except Exception as e:
        return {"fabric": "error", "detail": str(e)}