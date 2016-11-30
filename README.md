# Homebridge-Yamaha
homebridge-plugin for Yamaha AVR control with Apple-Homekit.

# Installation
Follow the instruction in [NPM](https://www.npmjs.com/package/homebridge) for the homebridge server installation. The plugin is published through [NPM](https://www.npmjs.com/package/homebridge-yamaha) and should be installed "globally" by typing:

    sudo npm install -g homebridge-yamaha

#Configuration

config.json

"manual_addresses" only needed if Bonjour/Autodetection doesn't work.

"zones_as_accessories" only needed if you have multiple speaker zones that you want to be exposed as seperate accessories to HomeKit.

Example:

  ```json
  {
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:51",
        "port": 51826,
        "pin": "031-45-154"
    },
    "description": "This is an example configuration file for homebridge plugin for yamaha AVR",
    "hint": "Always paste into jsonlint.com validation page before starting your homebridge, saves a lot of frustration",
    "platforms": [
        {
            "platform": "YamahaAVR",
            "play_volume": -48,
            "set_input_to": "Airplay",
            "manual_addresses": {
                "Yamaha": "192.168.1.115"
            },
            "zones_as_accessories": {
                "Yamaha": {
                    "1": {
                        "name":"Main"
                    },
                    "2": {
                        "name":"Zone 2"
                    }
                }
            }
        }
    ],
    "accessories": [
        {},
        {}
    ]
    }
