import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

TENANT_ID        = os.getenv("FABRIC_TENANT_ID")
CLIENT_ID        = os.getenv("FABRIC_CLIENT_ID")
CLIENT_SECRET    = os.getenv("FABRIC_CLIENT_SECRET")
WORKSPACE_ID     = os.getenv("FABRIC_WORKSPACE_ID")  
LAKEHOUSE_NAME   = os.getenv("FABRIC_DATABASE", "lavenir_lakehouse")
MANUAL_SUBFOLDER = "manual"
OUTPUT_DIR       = Path("./manuals")

PDF_FILES = [
    "CG-SVX17F-EN.pdf",
    "Fluid_Pump_Intervention_Guideline-v2.pdf",
    "HVAC_Predictive_Maintenance_Guideline-v2.pdf",
    "Hermetic Centrifugal Liquid Chillers.pdf",
    "Panasonic Air Conditioner.pdf",
    "Vibration-motor-user-manual.pdf",
    "brochure-electric-motor-problems-diagnostic-techniques-emerson.pdf",
    "engineering-manual-pump-handbook-2016-master-en.pdf",
    "LG-A100 Air Conditioner.pdf",
    "Mitsubishi Split Air Conditioner.pdf",
    "Carrier AguaSnap 30RB.pdf",
    "Daikin Air cooled screw chillers.pdf",
    "waukesha-cherry-burrell-95-03009-centrifugal-pumps-200-series-us.pdf",
    "Etanorm.pdf",
    "Grundfos SQ Service Instruction Manual.pdf",
    "KSB Etanorm Series.pdf",
    "Wilo IL Series.pdf",
    "BAC (Baltimore Aircoil) Cooling Tower.pdf",
    "EVAPCO ESW SERIES.pdf",
    "SPX Marley NC Series.pdf",
]


def main():
    print("─" * 60)
    print("L'Avenir — Downloading PDFs from Fabric Lakehouse")
    print("─" * 60)

   
    missing = [k for k, v in {
        "FABRIC_TENANT_ID": TENANT_ID,
        "FABRIC_CLIENT_ID": CLIENT_ID,
        "FABRIC_CLIENT_SECRET": CLIENT_SECRET,
        "FABRIC_WORKSPACE_ID": WORKSPACE_ID,
    }.items() if not v]

    if missing:
        print(f"\n❌ Missing environment variables: {', '.join(missing)}")
        print("   Add them to your .env file and retry.")
        sys.exit(1)

    try:
        from azure.identity import ClientSecretCredential
        from azure.storage.filedatalake import DataLakeServiceClient
    except ImportError:
        print("\n❌ Missing packages. Run:")
        print("   pip install azure-storage-file-datalake azure-identity")
        sys.exit(1)


    OUTPUT_DIR.mkdir(exist_ok=True)
    print(f"\n📁 Output directory: {OUTPUT_DIR.resolve()}")

    # Authenticate with Service Principal
    print(f"\n🔐 Authenticating as service principal {CLIENT_ID[:8]}...")
    credential = ClientSecretCredential(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )

    # Connect to OneLake (ADLS Gen2 compatible)
    # OneLake URL format: https://onelake.dfs.fabric.microsoft.com
    service_client = DataLakeServiceClient(
        account_url="https://onelake.dfs.fabric.microsoft.com",
        credential=credential,
    )

    # The filesystem in OneLake is the workspace ID
    # The path is: {lakehouse_name}.Lakehouse/Files/manual/
    fs_client = service_client.get_file_system_client(WORKSPACE_ID)
    base_path = f"{LAKEHOUSE_NAME}.Lakehouse/Files/{MANUAL_SUBFOLDER}"

    print(f"🔗 Connected to OneLake workspace: {WORKSPACE_ID}")
    print(f"📂 Lakehouse path: {base_path}")

    print(f"\n⬇️  Downloading {len(PDF_FILES)} PDFs...\n")

    success, skipped, failed = 0, 0, []

    for filename in PDF_FILES:
        local_path = OUTPUT_DIR / filename
        remote_path = f"{base_path}/{filename}"

    
        if local_path.exists():
            size_kb = local_path.stat().st_size // 1024
            print(f"  ⏭  Already exists: {filename} ({size_kb} KB)")
            skipped += 1
            continue

        try:
            file_client = fs_client.get_file_client(remote_path)
            download    = file_client.download_file()
            with open(local_path, "wb") as f:
                download.readinto(f)
            size_kb = local_path.stat().st_size // 1024
            print(f"  ✅ {filename} ({size_kb} KB)")
            success += 1
        except Exception as e:
            print(f"  ❌ {filename} — {e}")
            failed.append(filename)

    
    print(f"\n🔍 Checking for additional PDFs not in known list...")
    try:
        paths = fs_client.get_paths(path=base_path)
        extra = 0
        for path in paths:
            name = Path(path.name).name
            if name.endswith(".pdf") and name not in PDF_FILES:
                local_path  = OUTPUT_DIR / name
                remote_path = f"{base_path}/{name}"
                if not local_path.exists():
                    try:
                        file_client = fs_client.get_file_client(remote_path)
                        download    = file_client.download_file()
                        with open(local_path, "wb") as f:
                            download.readinto(f)
                        size_kb = local_path.stat().st_size // 1024
                        print(f"  ✅ NEW: {name} ({size_kb} KB)")
                        extra += 1
                    except Exception as e:
                        print(f"  ❌ NEW: {name} — {e}")
        if extra == 0:
            print("  ↳ No additional PDFs found")
    except Exception as e:
        print(f"  ⚠️  Could not scan directory: {e}")


    all_pdfs = list(OUTPUT_DIR.glob("*.pdf"))
    print(f"\n{'─' * 60}")
    print(f"DOWNLOAD COMPLETE")
    print(f"{'─' * 60}")
    print(f"  Downloaded : {success}")
    print(f"  Skipped    : {skipped} (already exist)")
    print(f"  Failed     : {len(failed)}")
    print(f"  Total PDFs : {len(all_pdfs)} in ./manuals/")

    if failed:
        print(f"\n⚠️  Failed files (check filenames match exactly in Fabric):")
        for f in failed:
            print(f"    - {f}")

    print(f"\n✅ Ready to build Docker image.")
    print(f"   The Dockerfile will copy ./manuals/ into the container.")


if __name__ == "__main__":
    main()