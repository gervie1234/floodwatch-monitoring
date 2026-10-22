#pragma once
// Copy this file to config.h. Never commit your real Wi-Fi password or API key.
constexpr char WIFI_SSID[] = "YOUR_2_4_GHZ_WIFI";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char API_URL[] = "http://192.168.1.10:5086/api/readings";
constexpr char DEVICE_KEY[] = "REPLACE_WITH_SERVER_DEVICE_API_KEY";
constexpr float MOUNTING_HEIGHT_CM = 150.0f;
constexpr float ADVISORY_CM = 30.0f;
constexpr float WARNING_CM = 50.0f;
constexpr float CRITICAL_CM = 70.0f;
constexpr float SENSOR_MIN_CM = 30.0f; // Increase if your sensor needs more clearance.
