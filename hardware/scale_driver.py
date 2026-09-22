"""
Supermarket Hardware Driver: RS-232 Digital Scale Integration
Communicates over serial COM port with retail checkout scales (Mettler Toledo, CAS, Avery Berkel, Dibal).
"""

import time
import re

try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False


class ScaleDriver:
    def __init__(self, port="COM3", baudrate=9600, timeout=1):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.connection = None
        self.tare_weight = 0.0

    def connect(self):
        if not SERIAL_AVAILABLE:
            print("[!] pyserial not installed. Operating in mock scale mode.")
            return False
        try:
            self.connection = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.SEVENBITS,
                parity=serial.PARITY_EVEN,
                stopbits=serial.STOPBITS_ONE,
                timeout=self.timeout
            )
            print(f"[✓] Connected to digital scale on {self.port} at {self.baudrate} baud.")
            return True
        except Exception as e:
            print(f"[!] Serial scale connection failed: {e}. Defaulting to mock scale.")
            return False

    def read_weight(self):
        """
        Sends standard Mettler Toledo enquiry character (ENQ = 0x05 or 'W')
        and parses weight response string (e.g. 'ST,GS,+001.250kg').
        """
        if not self.connection or not self.connection.is_open:
            return {"weight": 1.250, "unit": "kg", "stable": True, "mock": True}

        try:
            # Send standard weight poll command
            self.connection.write(b"W\r\n")
            time.sleep(0.05)
            raw_line = self.connection.readline().decode("ascii", errors="ignore").strip()

            # Parse standard protocol: status, gross/net, value, unit
            # Example: "ST,GS,  1.425,kg"
            match = re.search(r"([0-9]+\.[0-9]+)", raw_line)
            if match:
                gross = float(match.group(1))
                net = max(0.0, round(gross - self.tare_weight, 3))
                stable = "ST" in raw_line or "US" not in raw_line
                return {"weight": net, "gross": gross, "unit": "kg", "stable": stable, "mock": False}

            return {"weight": 0.000, "unit": "kg", "stable": False, "raw": raw_line}
        except Exception as e:
            print(f"[!] Scale read error: {e}")
            return {"weight": 0.000, "unit": "kg", "stable": False, "error": str(e)}

    def tare(self):
        """Zeroes out container tare weight."""
        current = self.read_weight()
        self.tare_weight = current.get("weight", 0.0)
        print(f"[✓] Tare set to {self.tare_weight} kg")
        return self.tare_weight

    def close(self):
        if self.connection and self.connection.is_open:
            self.connection.close()


if __name__ == "__main__":
    scale = ScaleDriver()
    scale.connect()
    print("Testing scale reading:", scale.read_weight())
