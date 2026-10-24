/*
  InspectPath sensor node (firmware v2)
  -------------------------------------
  Board   : ESP32-DevKitC V4 (Wokwi: board-esp32-devkit-c-v4)
  Build   : PlatformIO (framework = arduino), simulated with the Wokwi VS Code extension
  Sensors : MPU6050 (vibration, tilt), DHT22 (temperature, humidity),
            HC-SR04 (water level), HX711 + load cell (strain)
  RTOS    : FreeRTOS tasks, queues and mutexes (built into the ESP32 Arduino core)
  Author  : Varun Tushar Gharat

  What changed from v1 to match the team brief:
    - Trigger baseline is a linear regression of frequency on temperature, fitted
      on the healthy period (brief 6.4), with a fallback slope when the temperature
      barely moved during learning.
    - Residual = (actual - predicted) / predicted, in percent. Alerts use its
      ABSOLUTE value, so stiffening (frequency rising) is flagged too (brief 6.3).
    - Every window emits one record in the replay contract (brief 6.5), so the
      dashboard treats live node data exactly like Komal's replay files.
    - A second "status" record carries tilt, strain and water alerts.

  Serial commands (type in the Wokwi serial monitor, then press Enter):
    d  cycle simulated structural change: none, -3%, -6%, -10%, +6% (retrofit)
    f  freeze the IMU (fault injection, should trigger the stuck-sensor check)
    b  learn a new baseline
    h  show help
*/

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <HX711.h>
#include <math.h>
#include <stdarg.h>
#include <time.h>

// ============================================================================
// 1. Feature switches and identity
// ============================================================================
// Wokwi's MPU6050 cannot shake, so we add a synthetic bridge vibration on top of
// the real sensor reading. Set to 0 on real hardware mounted on a real bridge.
#define SIMULATE_VIBRATION 1

// Set to 1 to publish records over MQTT (Wokwi connects to the real internet).
#define ENABLE_MQTT 0

const char *NODE_ID = "node-1";             // must match planner/bridge_layout.json
const char *SOURCE  = "Wokwi simulation";   // "source" field of the replay contract

#if ENABLE_MQTT
#include <WiFi.h>
#include <PubSubClient.h>
const char *WIFI_SSID    = "Wokwi-GUEST";
const char *WIFI_PASS    = "";
const char *MQTT_HOST    = "broker.hivemq.com";
const int   MQTT_PORT    = 1883;
const char *TOPIC_TRIGGER = "inspectpath/node-1/trigger";   // brief 6.5 records
const char *TOPIC_STATUS  = "inspectpath/node-1/status";    // all other sensors
#endif

// ============================================================================
// 2. Pins (see diagram.json)
// ============================================================================
const int PIN_SDA    = 21;
const int PIN_SCL    = 22;
const int PIN_DHT    = 4;
const int PIN_TRIG   = 26;
const int PIN_ECHO   = 27;
const int PIN_HX_DT  = 32;
const int PIN_HX_SCK = 33;

// ============================================================================
// 3. Settings
// ============================================================================
// Sampling
const uint32_t IMU_PERIOD_MS    = 10;                    // 100 Hz
const float    FS_HZ            = 1000.0f / IMU_PERIOD_MS;
const int      N                = 1024;                  // samples per window = 10.24 s
const uint32_t STRAIN_PERIOD_MS = 100;                   // 10 Hz
const uint32_t ENV_PERIOD_MS    = 2000;                  // DHT22 allows one read per 2 s

// Frequency search band (first bridge modes are usually 1 to 10 Hz)
const float F_MIN_HZ = 1.0f;
const float F_MAX_HZ = 20.0f;

// Trigger model (brief 6.4)
const int   BASELINE_WINDOWS = 6;       // healthy windows used to fit the line (about 1 min)
const float MIN_TEMP_SPAN_C  = 3.0f;    // need this much temperature range to trust the fitted slope
const float K_TEMP           = -0.003f; // fallback slope: -0.3 % of frequency per degree C (demo value)
const float RESID_WATCH      = 2.0f;    // |residual| thresholds in percent
const float RESID_WARNING    = 5.0f;
const float RESID_ALARM      = 8.0f;

// Simulated bridge
const float F_HEALTHY_HZ = 4.2f;   // healthy first mode
const float SIM_AMPL     = 0.15f;  // m/s^2
const float SIM_NOISE    = 0.02f;  // m/s^2
const float T_REF_C      = 20.0f;  // temperature at which the simulated bridge rings at F_HEALTHY_HZ

// Ultrasonic mounting: height of the sensor above the river gauge zero
const float MOUNT_HEIGHT_M = 5.0f;
const float FLOOD_STAGE_M  = 3.0f;

// Strain: Wokwi uses a load cell, so we map kilograms on it to microstrain
const float HX_SCALE  = 420.0f;   // raw counts per gram (adjust if readings look off)
const float UE_PER_KG = 200.0f;   // demo mapping: 5 kg on the cell = 1000 microstrain
const float YIELD_UE  = 1250.0f;  // A36 steel yield, about 250 MPa / 200 GPa

// Data quality
const float ACC_LIMIT     = 19.0f;  // just under +-2 g, means saturation
const float SPIKE_LIMIT   = 10.0f;  // m/s^2 jump between two samples
const int   STUCK_SAMPLES = 50;     // identical samples in a row
const float JITTER_MS     = 1.0f;   // 10 % of the 10 ms period
const float MAX_FLAGGED   = 0.05f;  // more than 5 % flagged = window "degraded"
const uint32_t TEMP_MAX_AGE_MS = 10000;  // a temperature older than this counts as missing

// ============================================================================
// 4. Data types passed between tasks
// ============================================================================
enum SensorId : uint8_t { SENSOR_IMU, SENSOR_STRAIN, SENSOR_ENV };

// One raw reading from any sensor task. The meaning of v[] depends on id:
//   IMU    : v[0]=ax, v[1]=ay, v[2]=az (m/s^2), v[3]=time since last sample (ms)
//   STRAIN : v[0]=microstrain
//   ENV    : v[0]=temp C, v[1]=humidity %, v[2]=distance to water (m)
struct Reading {
  SensorId id;
  bool     ok;
  uint32_t t_ms;
  float    v[4];
};

// Quality flags (bits, so several can be set at once)
enum : uint8_t { QF_RANGE = 1, QF_STUCK = 2, QF_SPIKE = 4, QF_DROPOUT = 8, QF_JITTER = 16 };

// One 10.24 s block of vibration data, handed to the analysis task
struct Window {
  float    az[N];
  double   sumAx, sumAy, sumAz;
  uint16_t flagged;
  uint16_t why[5];   // how many samples had each flag: range, stuck, spike, dropout, jitter
};

struct EnvState {
  bool     tempOk, waterOk;
  float    tempC, rh;
  uint32_t lastGoodTempMs;   // when the last valid temperature arrived (0 = never)
  float    waterLevel_m, riseRate_mph;
  uint32_t freezeThawCycles;
  float    wetHours;
};
struct StrainState {
  bool  ok;
  float now_ue, peak_ue;
};

enum Level : uint8_t { NORMAL, WATCH, WARNING, ALARM };
const char *LEVEL_NAME[] = { "normal", "watch", "warning", "alarm" };   // lowercase, as in brief 6.5

// Everything the publish task needs to build both JSON records
struct Report {
  char     timestamp[25];
  bool     degraded;
  uint16_t flagged;
  float    tempC, rh;
  float    freqHz, predictedHz, residualPct;
  float    rmsRatio, tiltChangeDeg, strainPeak, waterLevel, waterRise, riseRate;
  Level    lvFreq, lvRms, lvTilt, lvStrain, lvWater, overall;
};

// ============================================================================
// 5. Global objects and RTOS handles
// ============================================================================
Adafruit_MPU6050 mpu;
DHT              dht(PIN_DHT, DHT22);
HX711            scale;

QueueHandle_t     rawQueue;     // sensor tasks -> quality task
QueueHandle_t     windowQueue;  // quality task -> analysis task (index of a full Window)
QueueHandle_t     reportQueue;  // analysis task -> publish task
SemaphoreHandle_t serialMutex;  // one task prints at a time
SemaphoreHandle_t stateMutex;   // protects g_env and g_strain

Window      windows[2];
EnvState    g_env    = {};
StrainState g_strain = {};
float       hann[N];

volatile int      g_simState   = 0;     // index into SIM_SHIFT_PCT
volatile bool     g_freezeImu  = false;
volatile bool     g_rebaseline = false;
volatile float    g_tempForSim = T_REF_C;
volatile uint32_t g_dropped    = 0;

const float SIM_SHIFT_PCT[5] = { 0.0f, -3.0f, -6.0f, -10.0f, +6.0f };

// ============================================================================
// 6. Helpers
// ============================================================================
void logf(const char *fmt, ...) {
  char buf[256];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  xSemaphoreTake(serialMutex, portMAX_DELAY);
  Serial.print(buf);
  xSemaphoreGive(serialMutex);
}

void printHelp() {
  logf("\nCommands: d = cycle structural change (0/-3/-6/-10/+6%%), f = freeze IMU, "
       "b = new baseline, h = help\n\n");
}

Level worst(Level a, Level b) { return a > b ? a : b; }

Level levelFromResidual(float residualPct) {
  float r = fabsf(residualPct);          // both directions count (damage or stiffening)
  if (r >= RESID_ALARM)   return ALARM;
  if (r >= RESID_WARNING) return WARNING;
  if (r >= RESID_WATCH)   return WATCH;
  return NORMAL;
}

// ISO 8601 UTC time, e.g. 2026-10-24T14:05:00Z. Before NTP sync it counts from 1970.
void isoTimestamp(char *out, size_t len) {
  time_t now = time(nullptr);
  if (now < 1600000000) now = millis() / 1000;   // clock not synced yet: use uptime
  struct tm t;
  gmtime_r(&now, &t);
  strftime(out, len, "%Y-%m-%dT%H:%M:%SZ", &t);
}

float simulatedVibration() {
  static float phase = 0.0f;
  float f = F_HEALTHY_HZ * (1.0f + SIM_SHIFT_PCT[g_simState] / 100.0f)
                         * (1.0f + K_TEMP * (g_tempForSim - T_REF_C));
  phase += 2.0f * PI * f * (IMU_PERIOD_MS / 1000.0f);
  if (phase > 2.0f * PI) phase -= 2.0f * PI;
  float noise = (random(-1000, 1001) / 1000.0f) * SIM_NOISE;
  return SIM_AMPL * sinf(phase) + noise;
}

float pingOnce(float tempC) {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, 38000UL);
  if (us == 0) return NAN;
  float c = 331.3f + 0.606f * tempC;
  return c * (us / 1e6f) / 2.0f;
}

float dominantFrequency(const float *x, float mean) {
  static float xw[N];
  static float mag[N / 2];
  for (int n = 0; n < N; n++) xw[n] = (x[n] - mean) * hann[n];

  const float binHz = FS_HZ / N;
  int kMin = (int)ceilf(F_MIN_HZ / binHz);
  int kMax = (int)floorf(F_MAX_HZ / binHz);

  int   best = kMin;
  float bestMag = 0;
  for (int k = kMin - 1; k <= kMax + 1; k++) {
    float w = 2.0f * PI * k / N;
    float cw = cosf(w), sw = sinf(w);
    float c = 1.0f, s = 0.0f, re = 0.0f, im = 0.0f;
    for (int n = 0; n < N; n++) {
      re += xw[n] * c;
      im -= xw[n] * s;
      float c2 = c * cw - s * sw;
      s = s * cw + c * sw;
      c = c2;
    }
    mag[k] = sqrtf(re * re + im * im);
    if (k >= kMin && k <= kMax && mag[k] > bestMag) { bestMag = mag[k]; best = k; }
  }
  float a = mag[best - 1], b = mag[best], c = mag[best + 1];
  float denom = a - 2 * b + c;
  float delta = (denom != 0) ? 0.5f * (a - c) / denom : 0.0f;
  return (best + delta) * binHz;
}

// Fit frequency = intercept + slope * temperature by least squares (brief 6.4).
// If the temperature hardly moved, the slope cannot be learned, so use the fallback.
void fitBaseline(const float *T, const float *F, int n, float &slope, float &intercept, bool &fitted) {
  float mT = 0, mF = 0, tMin = T[0], tMax = T[0];
  for (int i = 0; i < n; i++) {
    mT += T[i]; mF += F[i];
    tMin = fminf(tMin, T[i]); tMax = fmaxf(tMax, T[i]);
  }
  mT /= n; mF /= n;
  float sxy = 0, sxx = 0;
  for (int i = 0; i < n; i++) { sxy += (T[i] - mT) * (F[i] - mF); sxx += (T[i] - mT) * (T[i] - mT); }

  fitted = (tMax - tMin) >= MIN_TEMP_SPAN_C && sxx > 0;
  slope = fitted ? sxy / sxx : K_TEMP * mF;   // fallback: -0.3 % of the mean frequency per degree
  intercept = mF - slope * mT;
}

// ============================================================================
// 7. Task: IMU sampling (core 1, highest priority)
// ============================================================================
void imuTask(void *pv) {
  TickType_t lastWake = xTaskGetTickCount();
  uint32_t   lastMs   = millis();
  float      held[3]  = { 0, 0, 9.81f };

  for (;;) {
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(IMU_PERIOD_MS));

    Reading r = {};
    r.id   = SENSOR_IMU;
    r.t_ms = millis();
    r.v[3] = (float)(r.t_ms - lastMs);
    lastMs = r.t_ms;

    sensors_event_t a, g, t;
    r.ok = mpu.getEvent(&a, &g, &t);
    float ax = a.acceleration.x, ay = a.acceleration.y, az = a.acceleration.z;

#if SIMULATE_VIBRATION
    az += simulatedVibration();
#endif

    if (g_freezeImu) { ax = held[0]; ay = held[1]; az = held[2]; }
    else             { held[0] = ax; held[1] = ay; held[2] = az; }

    r.v[0] = ax; r.v[1] = ay; r.v[2] = az;
    if (xQueueSend(rawQueue, &r, 0) != pdTRUE) g_dropped++;
  }
}

// ============================================================================
// 8. Task: strain (core 1)
// ============================================================================
void strainTask(void *pv) {
  TickType_t lastWake = xTaskGetTickCount();
  for (;;) {
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(STRAIN_PERIOD_MS));
    Reading r = {};
    r.id   = SENSOR_STRAIN;
    r.t_ms = millis();
    if (scale.wait_ready_timeout(50)) {
      float grams = scale.get_units(1);
      r.v[0] = (grams / 1000.0f) * UE_PER_KG;
      r.ok   = true;
    }
    xQueueSend(rawQueue, &r, pdMS_TO_TICKS(5));
  }
}

// ============================================================================
// 9. Task: environment, DHT22 + HC-SR04 (core 1)
// ============================================================================
void envTask(void *pv) {
  TickType_t lastWake = xTaskGetTickCount();
  float lastGoodTemp = T_REF_C;

  for (;;) {
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(ENV_PERIOD_MS));
    Reading r = {};
    r.id   = SENSOR_ENV;
    r.t_ms = millis();
    // The DHT22 sends its data with microsecond timing. If the IMU task interrupts it
    // halfway, the read fails. So: raise this task above the IMU task for the read,
    // and try up to 3 times.
    float t = NAN, h = NAN;
    for (int attempt = 0; attempt < 3 && isnan(t); attempt++) {
      vTaskPrioritySet(NULL, 6);
      t = dht.readTemperature(false, attempt > 0);   // force a fresh read on retries
      h = dht.readHumidity();
      vTaskPrioritySet(NULL, 2);
      if (isnan(t)) vTaskDelay(pdMS_TO_TICKS(100));
    }
    r.v[0] = t;
    r.v[1] = h;
    if (!isnan(r.v[0])) lastGoodTemp = r.v[0];

    float d[5];
    int   good = 0;
    for (int i = 0; i < 5; i++) {
      float x = pingOnce(lastGoodTemp);
      if (!isnan(x)) d[good++] = x;
      vTaskDelay(pdMS_TO_TICKS(60));
    }
    if (good > 0) {
      for (int i = 1; i < good; i++) {
        float key = d[i]; int j = i - 1;
        while (j >= 0 && d[j] > key) { d[j + 1] = d[j]; j--; }
        d[j + 1] = key;
      }
      r.v[2] = d[good / 2];
    } else {
      r.v[2] = NAN;
    }
    r.ok = true;
    xQueueSend(rawQueue, &r, pdMS_TO_TICKS(50));
  }
}

// ============================================================================
// 10. Task: data quality (core 1)
// ============================================================================
void qualityTask(void *pv) {
  float lastAx = 0, lastAz = 0;
  int   stuckCount = 0;
  bool  firstImu = true;

  uint8_t fillIdx = 0;
  int     fillCount = 0;

  float levelHist[30];
  int   histCount = 0, histPos = 0;
  bool  wasBelowZero = false;

  Reading r;
  for (;;) {
    xQueueReceive(rawQueue, &r, portMAX_DELAY);

    if (r.id == SENSOR_IMU) {
      uint8_t f = 0;
      float ax = r.v[0], ay = r.v[1], az = r.v[2];
      if (!r.ok) f |= QF_DROPOUT;
      if (fabsf(ax) >= ACC_LIMIT || fabsf(ay) >= ACC_LIMIT || fabsf(az) >= ACC_LIMIT) f |= QF_RANGE;
      if (fabsf(r.v[3] - IMU_PERIOD_MS) > JITTER_MS) f |= QF_JITTER;
      if (!firstImu) {
        if (az == lastAz && ax == lastAx) { if (++stuckCount >= STUCK_SAMPLES) f |= QF_STUCK; }
        else stuckCount = 0;
        if (fabsf(az - lastAz) > SPIKE_LIMIT) f |= QF_SPIKE;
      }
      firstImu = false;
      lastAx = ax; lastAz = az;

      Window &w = windows[fillIdx];
      if (fillCount == 0) {
        w.sumAx = w.sumAy = w.sumAz = 0;
        w.flagged = 0;
        for (int b = 0; b < 5; b++) w.why[b] = 0;
      }
      w.az[fillCount] = az;
      w.sumAx += ax; w.sumAy += ay; w.sumAz += az;
      if (f) {
        w.flagged++;
        for (int b = 0; b < 5; b++) if (f & (1 << b)) w.why[b]++;   // count each reason separately
      }

      if (++fillCount == N) {
        w.flagged += g_dropped;
        g_dropped = 0;
        uint8_t done = fillIdx;
        xQueueSend(windowQueue, &done, 0);
        fillIdx ^= 1;
        fillCount = 0;
      }
    }

    else if (r.id == SENSOR_STRAIN) {
      bool ok = r.ok && fabsf(r.v[0]) < 5000.0f;
      xSemaphoreTake(stateMutex, portMAX_DELAY);
      g_strain.ok = ok;
      if (ok) {
        g_strain.now_ue = r.v[0];
        if (r.v[0] > g_strain.peak_ue) g_strain.peak_ue = r.v[0];
      }
      xSemaphoreGive(stateMutex);
    }

    else if (r.id == SENSOR_ENV) {
      float t = r.v[0], h = r.v[1], d = r.v[2];
      bool tempOk  = !isnan(t) && t > -40.0f && t < 80.0f && !isnan(h) && h >= 0 && h <= 100;
      bool waterOk = !isnan(d) && d > 0.02f && d < 4.0f;
      float level = waterOk ? MOUNT_HEIGHT_M - d : NAN;

      float rate = 0;
      if (waterOk) {
        levelHist[histPos] = level;
        histPos = (histPos + 1) % 30;
        if (histCount < 30) histCount++;
        if (histCount == 30) rate = (level - levelHist[histPos]) * 60.0f;
      }

      xSemaphoreTake(stateMutex, portMAX_DELAY);
      g_env.tempOk = tempOk;
      g_env.waterOk = waterOk;
      if (tempOk) {
        g_env.tempC = t;
        g_env.rh = h;
        g_env.lastGoodTempMs = r.t_ms;
        g_tempForSim = t;
        if (t < 0) wasBelowZero = true;
        else if (wasBelowZero) { g_env.freezeThawCycles++; wasBelowZero = false; }
        if (h > 80.0f && t > 0.0f) g_env.wetHours += ENV_PERIOD_MS / 3600000.0f;
      }
      if (waterOk) { g_env.waterLevel_m = level; g_env.riseRate_mph = rate; }
      xSemaphoreGive(stateMutex);
    }
  }
}

// ============================================================================
// 11. Task: analysis (core 0)
// ============================================================================
void analysisTask(void *pv) {
  // Healthy-period samples for the trigger model
  float baseT[BASELINE_WINDOWS], baseF[BASELINE_WINDOWS];
  int   baseCount = 0;
  bool  baselineReady = false;
  float slope = 0, intercept = 0;
  bool  fitted = false;
  // Baselines for the other sensors (simple averages)
  float baseRms = 0, basePitch = 0, baseRoll = 0, baseStrain = 0, baseWater = 0;

  uint8_t idx;
  for (;;) {
    xQueueReceive(windowQueue, &idx, portMAX_DELAY);
    Window &w = windows[idx];

    xSemaphoreTake(stateMutex, portMAX_DELAY);
    EnvState    env = g_env;
    StrainState st  = g_strain;
    g_strain.peak_ue = g_strain.now_ue;
    xSemaphoreGive(stateMutex);

    // --- Features from this window ---
    float meanAx = w.sumAx / N, meanAy = w.sumAy / N, meanAz = w.sumAz / N;
    double sq = 0;
    for (int n = 0; n < N; n++) { float d = w.az[n] - meanAz; sq += d * d; }
    float rms   = sqrtf(sq / N);
    float freq  = dominantFrequency(w.az, meanAz);
    float pitch = atan2f(meanAx, sqrtf(meanAy * meanAy + meanAz * meanAz)) * 180.0f / PI;
    float roll  = atan2f(meanAy, meanAz) * 180.0f / PI;
    // Degraded = too many flagged samples, or no valid temperature in the last 10 s.
    // One failed DHT22 read no longer spoils a window, because the last good value is used.
    bool  tempFresh = env.lastGoodTempMs != 0 && (millis() - env.lastGoodTempMs) < TEMP_MAX_AGE_MS;
    bool  degraded  = (w.flagged > N * MAX_FLAGGED) || !tempFresh;

    if (g_rebaseline) { baseCount = 0; baselineReady = false; g_rebaseline = false; }

    // --- Healthy period: collect, then fit ---
    if (!baselineReady) {
      if (degraded) {
        logf("[baseline] window skipped: %u/%d samples flagged (range %u, stuck %u, spike %u, "
             "dropout %u, jitter %u), temperature %s\n",
             w.flagged, N, w.why[0], w.why[1], w.why[2], w.why[3], w.why[4],
             tempFresh ? "ok" : "MISSING (check the DHT22 on GPIO4)");
        continue;
      }
      baseT[baseCount] = env.tempC;
      baseF[baseCount] = freq;
      if (baseCount == 0) { baseRms = basePitch = baseRoll = baseStrain = baseWater = 0; }
      baseRms += rms; basePitch += pitch; baseRoll += roll;
      baseStrain += st.peak_ue; baseWater += env.waterLevel_m;
      baseCount++;
      logf("[baseline] %d/%d  f=%.3f Hz at %.1f C\n", baseCount, BASELINE_WINDOWS, freq, env.tempC);

      if (baseCount == BASELINE_WINDOWS) {
        fitBaseline(baseT, baseF, BASELINE_WINDOWS, slope, intercept, fitted);
        baseRms /= BASELINE_WINDOWS; basePitch /= BASELINE_WINDOWS; baseRoll /= BASELINE_WINDOWS;
        baseStrain /= BASELINE_WINDOWS; baseWater /= BASELINE_WINDOWS;
        baselineReady = true;
        logf("[baseline] f = %.4f + (%.5f x T)  [%s]\n", intercept, slope,
             fitted ? "slope fitted from data" : "temperature range too small, fallback slope used");
      }
      continue;
    }

    // --- Trigger model: predicted frequency, residual, alert (brief 6.4) ---
    Report rep = {};
    isoTimestamp(rep.timestamp, sizeof(rep.timestamp));
    rep.degraded    = degraded;
    rep.flagged     = w.flagged;
    rep.tempC       = env.tempC;
    rep.rh          = env.rh;
    rep.freqHz      = freq;
    rep.predictedHz = intercept + slope * env.tempC;
    rep.residualPct = (freq - rep.predictedHz) / rep.predictedHz * 100.0f;
    rep.lvFreq      = levelFromResidual(rep.residualPct);

    // --- Other sensors ---
    rep.rmsRatio = baseRms > 0 ? rms / baseRms : 1.0f;
    rep.lvRms = rep.rmsRatio >= 2.0f ? WARNING : rep.rmsRatio >= 1.5f ? WATCH : NORMAL;

    rep.tiltChangeDeg = fmaxf(fabsf(pitch - basePitch), fabsf(roll - baseRoll));
    rep.lvTilt = rep.tiltChangeDeg >= 1.0f ? ALARM : rep.tiltChangeDeg >= 0.5f ? WARNING
               : rep.tiltChangeDeg >= 0.25f ? WATCH : NORMAL;

    rep.strainPeak = st.peak_ue;
    float watchUe = fmaxf(1.3f * baseStrain, 100.0f);
    rep.lvStrain = !st.ok ? NORMAL
                 : st.peak_ue >= 0.5f * YIELD_UE ? ALARM
                 : st.peak_ue >= 0.3f * YIELD_UE ? WARNING
                 : st.peak_ue >= watchUe ? WATCH : NORMAL;

    rep.waterLevel = env.waterLevel_m;
    rep.waterRise  = env.waterLevel_m - baseWater;
    rep.riseRate   = env.riseRate_mph;
    rep.lvWater = !env.waterOk ? NORMAL
                : env.waterLevel_m >= FLOOD_STAGE_M ? ALARM
                : (rep.waterRise >= 1.0f || env.riseRate_mph >= 0.3f) ? WARNING
                : rep.waterRise >= 0.5f ? WATCH : NORMAL;

    Level lv[5] = { rep.lvFreq, rep.lvRms, rep.lvTilt, rep.lvStrain, rep.lvWater };
    Level overall = NORMAL;
    int watches = 0;
    for (Level l : lv) { overall = worst(overall, l); if (l == WATCH) watches++; }
    if (watches >= 2) overall = worst(overall, WARNING);
    rep.overall = overall;

    // --- Human-readable report ---
    char out[1024];
    int  p = 0;
    p += snprintf(out + p, sizeof(out) - p, "\n===== %s  %s =====\n", NODE_ID, rep.timestamp);
    p += snprintf(out + p, sizeof(out) - p,
                  "Quality   : %s (%u / %d flagged: range %u, stuck %u, spike %u, dropout %u, jitter %u; temperature %s)\n",
                  degraded ? "DEGRADED" : "ok", w.flagged, N, w.why[0], w.why[1], w.why[2], w.why[3], w.why[4],
                  tempFresh ? "ok" : "missing");
    p += snprintf(out + p, sizeof(out) - p, "Trigger   : f %.3f Hz, predicted %.3f Hz at %.1f C, residual %+.2f%%  -> %s\n",
                  freq, rep.predictedHz, env.tempC, rep.residualPct, LEVEL_NAME[rep.lvFreq]);
    p += snprintf(out + p, sizeof(out) - p, "Vibration : RMS x%.2f of baseline  -> %s\n", rep.rmsRatio, LEVEL_NAME[rep.lvRms]);
    p += snprintf(out + p, sizeof(out) - p, "Tilt      : change %.2f deg  -> %s\n", rep.tiltChangeDeg, LEVEL_NAME[rep.lvTilt]);
    p += snprintf(out + p, sizeof(out) - p, "Strain    : peak %.0f microstrain  -> %s\n", rep.strainPeak, LEVEL_NAME[rep.lvStrain]);
    p += snprintf(out + p, sizeof(out) - p, "Water     : %.2f m (rise %+.2f m, %.2f m/h)  -> %s\n",
                  rep.waterLevel, rep.waterRise, rep.riseRate, LEVEL_NAME[rep.lvWater]);
    p += snprintf(out + p, sizeof(out) - p, "Overall   : %s\n", degraded ? "degraded, alerts paused" : LEVEL_NAME[overall]);

    xSemaphoreTake(serialMutex, portMAX_DELAY);
    Serial.print(out);
    xSemaphoreGive(serialMutex);

    xQueueOverwrite(reportQueue, &rep);
  }
}

// ============================================================================
// 12. JSON records
// ============================================================================
// Record in the replay contract (brief 6.5). Identical shape to Komal's replay files.
int buildTriggerJson(const Report &r, char *out, size_t len) {
  return snprintf(out, len,
    "{\"node_id\":\"%s\",\"timestamp\":\"%s\",\"temperature_c\":%.1f,"
    "\"frequency_hz\":%.3f,\"predicted_frequency_hz\":%.3f,\"residual_pct\":%.2f,"
    "\"alert_level\":\"%s\",\"quality\":\"%s\",\"source\":\"%s\"}",
    NODE_ID, r.timestamp, r.tempC, r.freqHz, r.predictedHz, r.residualPct,
    LEVEL_NAME[r.lvFreq], r.degraded ? "degraded" : "ok", SOURCE);
}

// Extra record for the sensors the trigger contract does not cover.
int buildStatusJson(const Report &r, char *out, size_t len) {
  return snprintf(out, len,
    "{\"node_id\":\"%s\",\"timestamp\":\"%s\",\"overall_alert\":\"%s\",\"quality\":\"%s\","
    "\"levels\":{\"frequency\":\"%s\",\"vibration\":\"%s\",\"tilt\":\"%s\",\"strain\":\"%s\",\"water\":\"%s\"},"
    "\"rms_ratio\":%.2f,\"tilt_change_deg\":%.3f,\"strain_peak_ue\":%.0f,"
    "\"water_level_m\":%.2f,\"water_rise_m\":%.2f,\"rise_rate_m_per_h\":%.2f,"
    "\"temperature_c\":%.1f,\"humidity_pct\":%.0f,\"flagged_samples\":%u,\"source\":\"%s\"}",
    NODE_ID, r.timestamp, LEVEL_NAME[r.overall], r.degraded ? "degraded" : "ok",
    LEVEL_NAME[r.lvFreq], LEVEL_NAME[r.lvRms], LEVEL_NAME[r.lvTilt], LEVEL_NAME[r.lvStrain], LEVEL_NAME[r.lvWater],
    r.rmsRatio, r.tiltChangeDeg, r.strainPeak, r.waterLevel, r.waterRise, r.riseRate,
    r.tempC, r.rh, r.flagged, SOURCE);
}

// ============================================================================
// 13. Task: publish (core 0, lowest priority)
// Always prints both records to serial (lines start with @trigger / @status),
// and also sends them over MQTT when ENABLE_MQTT is 1.
// ============================================================================
#if ENABLE_MQTT
WiFiClient   net;
PubSubClient mqtt(net);

bool ensureConnected() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (mqtt.connected()) return true;
  char id[32];
  snprintf(id, sizeof(id), "inspectpath-%08lx", (unsigned long)esp_random());
  if (mqtt.connect(id)) { logf("[mqtt] connected\n"); return true; }
  return false;
}
#endif

void publishTask(void *pv) {
#if ENABLE_MQTT
  WiFi.begin(WIFI_SSID, WIFI_PASS, 6);              // Wokwi-GUEST is on channel 6
  configTime(0, 0, "pool.ntp.org");                 // real UTC timestamps once online
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(768);                          // status record is longer than the 256-byte default
#endif
  Report rep;
  char trig[320], stat[640];
  for (;;) {
#if ENABLE_MQTT
    bool online = ensureConnected();
    if (online) mqtt.loop();
#endif
    if (xQueueReceive(reportQueue, &rep, pdMS_TO_TICKS(200)) != pdTRUE) continue;

    buildTriggerJson(rep, trig, sizeof(trig));
    buildStatusJson(rep, stat, sizeof(stat));
    // Printed directly (not with logf) because the status record is longer than logf's 256-byte buffer
    xSemaphoreTake(serialMutex, portMAX_DELAY);
    Serial.print("@trigger "); Serial.println(trig);
    Serial.print("@status ");  Serial.println(stat);
    xSemaphoreGive(serialMutex);

#if ENABLE_MQTT
    if (online) {
      mqtt.publish(TOPIC_TRIGGER, trig);
      mqtt.publish(TOPIC_STATUS, stat);
    }
#endif
  }
}

// ============================================================================
// 14. Task: serial commands (core 1, lowest priority)
// ============================================================================
void commandTask(void *pv) {
  for (;;) {
    while (Serial.available()) {
      char c = Serial.read();
      switch (c) {
        case 'd':
          g_simState = (g_simState + 1) % 5;
          logf("[cmd] simulated structural change: %+.0f%% frequency%s\n", SIM_SHIFT_PCT[g_simState],
               SIM_SHIFT_PCT[g_simState] > 0 ? " (stiffer, like a retrofit)" : "");
          break;
        case 'f':
          g_freezeImu = !g_freezeImu;
          logf("[cmd] IMU %s\n", g_freezeImu ? "FROZEN (fault injected)" : "running normally");
          break;
        case 'b':
          g_rebaseline = true;
          logf("[cmd] learning a new baseline\n");
          break;
        case 'h':
          printHelp();
          break;
        default:
          break;
      }
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// ============================================================================
// 15. setup() and loop()
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  serialMutex = xSemaphoreCreateMutex();
  stateMutex  = xSemaphoreCreateMutex();
  rawQueue    = xQueueCreate(64, sizeof(Reading));
  windowQueue = xQueueCreate(2, sizeof(uint8_t));
  reportQueue = xQueueCreate(1, sizeof(Report));

  Wire.begin(PIN_SDA, PIN_SCL);
  while (!mpu.begin()) {
    Serial.println("MPU6050 not found. Check SDA = GPIO21, SCL = GPIO22.");
    delay(1000);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_44_HZ);

  dht.begin();
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  scale.begin(PIN_HX_DT, PIN_HX_SCK);
  scale.set_scale(HX_SCALE);
  scale.tare();

  for (int n = 0; n < N; n++) hann[n] = 0.5f * (1.0f - cosf(2.0f * PI * n / (N - 1)));

  Serial.printf("\nInspectPath sensor node %s starting.\n", NODE_ID);
  Serial.printf("The first %d windows (about %d s) learn the healthy baseline.\n",
                BASELINE_WINDOWS, (int)(BASELINE_WINDOWS * N / FS_HZ));
  printHelp();

  //                      function      name       stack  param prio handle core
  xTaskCreatePinnedToCore(imuTask,      "imu",      4096, NULL, 5,   NULL,  1);
  xTaskCreatePinnedToCore(qualityTask,  "quality",  4096, NULL, 4,   NULL,  1);
  xTaskCreatePinnedToCore(strainTask,   "strain",   3072, NULL, 3,   NULL,  1);
  xTaskCreatePinnedToCore(envTask,      "env",      4096, NULL, 2,   NULL,  1);
  xTaskCreatePinnedToCore(commandTask,  "cmd",      3072, NULL, 1,   NULL,  1);
  xTaskCreatePinnedToCore(analysisTask, "analysis", 8192, NULL, 3,   NULL,  0);
  xTaskCreatePinnedToCore(publishTask,  "publish",  6144, NULL, 1,   NULL,  0);
}

void loop() {
  vTaskDelete(NULL);
}
