// FloodWatch college prototype. Classic ESP32-WROOM DevKit, not C3/S3 pinout.
// Hardware validation required. See the build tutorial before powering the circuit.
#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPSPlus.h>
#include <time.h>
#include <algorithm>
#include "config.h"

constexpr int TRIG_PIN=25, ECHO_PIN=26, BUZZER_PIN=27;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);
struct Observation {float distance; double lat, lon; bool fix; time_t at; unsigned long sampledAt;};
QueueHandle_t observations;
unsigned long lastSample=0,lastBurst=0,lastWifiAttempt=0;
float samples[5]; int attempts=0,validSamples=0,invalidCycles=0;
float lastDistance=0; bool hasReading=false;
int alarmState=0,candidateState=-1,confirmations=0;
char bootId[24];
uint32_t sequence=0;

int classify(float level){return level>=CRITICAL_CM?3:level>=WARNING_CM?2:level>=ADVISORY_CM?1:0;}
float boundary(int state){return state==3?CRITICAL_CM:state==2?WARNING_CM:ADVISORY_CM;}
void updateState(float level){
 int target=classify(level);
 // Require a 3 cm fall below the current state's boundary before clearing it.
 if(target<alarmState && level>=boundary(alarmState)-3.0f) target=alarmState;
 if(target==alarmState){candidateState=-1;confirmations=0;return;}
 if(target!=candidateState){candidateState=target;confirmations=1;}else confirmations++;
 if(confirmations>=3){alarmState=target;candidateState=-1;confirmations=0;}
}
void networkTask(void*){
 Observation o;
 for(;;){
  if(xQueueReceive(observations,&o,pdMS_TO_TICKS(1000))!=pdTRUE) continue;
  if(WiFi.status()!=WL_CONNECTED || time(nullptr)<1700000000 || millis()-o.sampledAt>15000) continue;
  struct tm utc; gmtime_r(&o.at,&utc); char stamp[32]; strftime(stamp,sizeof(stamp),"%Y-%m-%dT%H:%M:%SZ",&utc);
  const String coords=o.fix?String("\"latitude\":")+String(o.lat,6)+",\"longitude\":"+String(o.lon,6):"\"latitude\":null,\"longitude\":null";
  const uint32_t packetSequence=sequence++;
  String body=String("{\"deviceId\":\"FW-001\",\"bootId\":\"")+bootId+"\",\"sequence\":"+String(packetSequence)+",\"observedAtUtc\":\""+stamp+"\",\"distanceCm\":"+String(o.distance,2)+","+coords+"}";
  HTTPClient http; http.setConnectTimeout(1500); http.setTimeout(1500);
  if(http.begin(API_URL)){
   http.addHeader("Content-Type","application/json");http.addHeader("X-Device-Key",DEVICE_KEY);
   int code=http.POST(body); Serial.printf("API HTTP %d\n",code);http.end();
  }
  // Starter behavior: one attempt per observation, no offline replay.
 }
}
void setup(){
 Serial.begin(115200);pinMode(TRIG_PIN,OUTPUT);digitalWrite(TRIG_PIN,LOW);
 pinMode(ECHO_PIN,INPUT);pinMode(BUZZER_PIN,OUTPUT);digitalWrite(BUZZER_PIN,LOW);
 if(!(MOUNTING_HEIGHT_CM>=40 && MOUNTING_HEIGHT_CM<=600 && SENSOR_MIN_CM>=30 &&
      ADVISORY_CM>=0 && ADVISORY_CM<WARNING_CM && WARNING_CM<CRITICAL_CM &&
      CRITICAL_CM<=MOUNTING_HEIGHT_CM-SENSOR_MIN_CM)){
  Serial.println("Invalid height/threshold configuration. Correct config.h before use.");
  for(;;) delay(1000);
 }
 gpsSerial.begin(9600,SERIAL_8N1,16,17);
 snprintf(bootId,sizeof(bootId),"%08lx%08lx",(unsigned long)esp_random(),(unsigned long)esp_random());
 observations=xQueueCreate(1,sizeof(Observation));
 if(!observations || xTaskCreate(networkTask,"telemetry",8192,nullptr,1,nullptr)!=pdPASS){
  Serial.println("Telemetry task failed; restart required.");for(;;) delay(1000);
 }
 WiFi.mode(WIFI_STA);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
 configTime(0,0,"pool.ntp.org","time.google.com");
 Serial.println("FloodWatch started. Local sensing continues without Wi-Fi.");
}
void loop(){
 while(gpsSerial.available()) gps.encode(gpsSerial.read());
 const unsigned long now=millis();
 if(WiFi.status()!=WL_CONNECTED && now-lastWifiAttempt>=15000){lastWifiAttempt=now;WiFi.reconnect();}
 if(now-lastBurst>=2000 && now-lastSample>=100){
  lastSample=now;
  digitalWrite(TRIG_PIN,LOW);delayMicroseconds(3);digitalWrite(TRIG_PIN,HIGH);delayMicroseconds(20);digitalWrite(TRIG_PIN,LOW);
  unsigned long echo=pulseIn(ECHO_PIN,HIGH,35000);
  float distance=echo*0.0343f/2.0f;
  if(echo>0 && distance>=SENSOR_MIN_CM && distance<=MOUNTING_HEIGHT_CM) samples[validSamples++]=distance;
  if(++attempts==5){
   if(validSamples>=3){
    std::sort(samples,samples+validSamples);lastDistance=samples[validSamples/2];hasReading=true;invalidCycles=0;
    const float level=MOUNTING_HEIGHT_CM-lastDistance;updateState(level);
    Serial.printf("Distance %.1f cm | Level %.1f cm | State %d\n",lastDistance,level,alarmState);
    static unsigned long lastSend=0;
    if(now-lastSend>=10000){
     lastSend=now;Observation o={};o.distance=lastDistance;o.at=time(nullptr);o.sampledAt=now;
     o.fix=gps.location.isValid() && gps.location.age()<10000;
     o.lat=gps.location.lat();o.lon=gps.location.lng();
     if(o.at>=1700000000) xQueueOverwrite(observations,&o);
     else Serial.println("Waiting for NTP clock sync; local sensing active.");
    }
   }else{
    invalidCycles++;candidateState=-1;confirmations=0;
    Serial.println("Invalid sensor cycle; no reading sent.");
   }
   attempts=validSamples=0;lastBurst=now;
  }
 }
 const bool fault=invalidCycles>=3 || !hasReading;
 // Preserve hazard pattern on sensor fault; otherwise a brief chirp every 5 s.
 const bool on=alarmState==3 ? now%400<180 : alarmState==2 ? now%1500<220 : fault ? now%5000<80 : false;
 digitalWrite(BUZZER_PIN,on?HIGH:LOW);
 delay(1);
}
