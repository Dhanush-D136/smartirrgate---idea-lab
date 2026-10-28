import sqlite3

conn = sqlite3.connect('smartirrigate.db')
cursor = conn.cursor()
rows = cursor.execute('SELECT id, timestamp, soil_moisture_percent, pump_state FROM sensor_readings ORDER BY id DESC LIMIT 40').fetchall()
for r in reversed(rows):
    print(r)
conn.close()
