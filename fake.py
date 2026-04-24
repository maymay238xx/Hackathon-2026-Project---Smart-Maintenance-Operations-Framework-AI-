import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Parameters
num_records = 5000
start_time = datetime.now() - timedelta(days=7)

# Time series (every 5 mins)
timestamps = [start_time + timedelta(minutes=5*i) for i in range(num_records)]

data = {
    "timestamp": timestamps,
    "building_id": np.random.choice(["B1", "B2"], num_records),
    "floor": np.random.choice([1, 2, 3, 4, 5], num_records),
    "room": np.random.choice(
        ["101", "102", "201", "202", "ServerRoom", "MechanicalRoom"],
        num_records
    ),
    "zone": np.random.choice(["North", "South", "East", "West"], num_records),
    "equipment_id": np.random.choice(["HVAC_1", "HVAC_2", "PUMP_1"], num_records),
    "temperature_c": np.random.normal(22, 2, num_records),
    "pressure_bar": np.random.normal(2.5, 0.3, num_records),
    "vibration_mm_s": np.random.normal(1.2, 0.2, num_records),
    "power_kw": np.random.normal(18, 3, num_records),
    "humidity_pct": np.random.normal(45, 8, num_records)
}

df = pd.DataFrame(data)
df.head()

# ✅ Save to CSV in current directory
df.to_csv("fake_data.csv", index=False)

print("✅ fake_data.csv created in current directory")
