#pragma once
// Copy this file to config.h. Never commit your real Wi-Fi password or API key.
constexpr char WIFI_SSID[] = "YOUR_2_4_GHZ_WIFI";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
// Use the local HTTP address on the test LAN. For a hosted API, use its final
// https:// URL ending in /api/readings and include its CA in api-root-ca.h.
constexpr char API_URL[] = "http://192.168.1.10:5086/api/readings";
constexpr char DEVICE_KEY[] = "REPLACE_WITH_SERVER_DEVICE_API_KEY";
// Student setup already tested on GPIO5/GPIO18. Keep the ECHO voltage divider.
#define FLOODWATCH_TRIG_PIN 5
#define FLOODWATCH_ECHO_PIN 18
// Bench example in the GPS/webpage guide. Set the real height before mounting.
constexpr float MOUNTING_HEIGHT_CM = 100.0f;
constexpr float ADVISORY_CM = 10.0f;
constexpr float WARNING_CM = 30.0f;
constexpr float CRITICAL_CM = 50.0f;
constexpr float SENSOR_MIN_CM = 30.0f; // Increase if your sensor needs more clearance.
