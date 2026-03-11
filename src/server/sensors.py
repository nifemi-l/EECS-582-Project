"""
PROLOGUE
File name: sensors.py
Description: Class for a sensors attached to a particular household.
Programmer: Delroy Wright (Converted to Python)
Creation date: 3/11/26
Preconditions: A client is running and has access to the Sensors class.
Postconditions: An instantiated Sensors class.
"""

class Sensors:
    def __init__(self, temperature=0.0, humidity=0.0, pressure=0.0, light=0.0, noise=0.0):
        self.temperature = temperature
        self.humidity = humidity
        self.pressure = pressure
        self.light = light
        self.noise = noise

    def to_dict(self):
        return {
            "temperature": self.temperature,
            "humidity": self.humidity,
            "pressure": self.pressure,
            "light": self.light,
            "noise": self.noise
        }
