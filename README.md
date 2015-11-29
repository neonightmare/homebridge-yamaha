# Homebridge-Yamaha
homebridge-plugin for Yamaha AVR control with Apple-Homekit.

# Installation

    sudo npm install -g https://github.com/neonightmare/homebridge-yamaha.git

#Configuration

config.json

"manual_addresses" only needed if Bonjour/Autodetection doesn't work.

Example:

  ```json
  {
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:51",
        "port": 51826,
        "pin": "031-45-154"
    },
    "description": "This is an example configuration file for KNX platform shim",
    "hint": "Always paste into jsonlint.com validation page before starting your homebridge, saves a lot of frustration",
    "hint2": "Replace all group addresses by current addresses of your installation, these are arbitrary examples!",
    "hint3": "For valid services and their characteristics have a look at the knxdevice.md file in folder accessories!",
    "platforms": [
        {
            "platform": "YamahaAVR",
            "play_volume": -48,
            "setMainInputTo": "Airplay",
            "manual_addresses": {
                "Yamaha": "192.168.1.115"
            }
        }
    ],
    "accessories": [
        {},
        {}
    ]
    }
