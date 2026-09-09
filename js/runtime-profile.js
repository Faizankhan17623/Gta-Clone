export const runtimeProfile = {
  "contractVersion": 1,
  "id": "basic",
  "save": {
    "live": "opencity.basic.save.v2",
    "active": "opencity.basic.active",
    "slotPrefix": "opencity.basic.slot.",
    "namePrefix": "opencity.basic.name."
  },
  "settingsDefaults": {
    "volume": 1,
    "sens": 1,
    "invertY": false,
    "lowGfx": false,
    "ao": false
  },
  "graphics": {
    "resolutionMode": "device-tier",
    "detailTiers": [
      "low",
      "medium",
      "high"
    ]
  },
  "starterVehicle": {
    "modelId": "basic-sedan",
    "fuelLiters": 35,
    "color": "#257780",
    "offsetX": 5,
    "offsetZ": 9
  },
  "vehicles": [
    {
      "id": "basic-sedan",
      "fuelCapacityLiters": 55,
      "fuelType": "petrol"
    }
  ],
  "services": {
    "bank": false,
    "bankCredentialKey": "opencity.basic.bank"
  }
};
