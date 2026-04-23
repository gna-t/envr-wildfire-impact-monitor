# Wildfire Impact Monitor
https://wildlife-impact-monitor.vercel.app/

A real time environmental screening tool that links wildfire activity with local air quality conditions.

This project focuses on one problem:
Wildfires impact air quality beyond the burn area, but most tools do not connect fire detections with local pollution data.

---

## What it does

- Maps wildfire detections near any U.S. city  
- Displays real time AQI and pollutant levels  
- Calculates distance to nearest wildfire hotspot  
- Classifies fire activity level  
- Shows 24 hour PM2.5 trend  
- Generates a simple smoke impact interpretation  

The goal is to give a fast screening view of potential wildfire smoke exposure.

---

## Tech Stack

- JavaScript, HTML, CSS  
- Leaflet for interactive mapping  
- Chart.js for PM2.5 trends  
- Open Meteo APIs  
- NASA FIRMS wildfire API  

Runs fully in browser.

---

## Data Sources

- Open Meteo Geocoding API  
- Open Meteo Air Quality API  
- NASA FIRMS wildfire detection API :contentReference[oaicite:0]{index=0}  

---

## How it works

1. User searches for a U.S. city  
2. Coordinates are retrieved using geocoding  
3. Air quality data is fetched for that location  
4. NASA FIRMS is queried for recent wildfire detections  
5. Distances to fires are calculated  
6. Results are displayed on a map and dashboard  
7. A screening level interpretation is generated  

Wildfire detections are pulled from near real time satellite data :contentReference[oaicite:1]{index=1}  

---

## Key Features

### Spatial Incident View
- Interactive map with:
  - City reference point  
  - Nearby wildfire detections  
- Visualizes regional fire activity  

### Air Quality Monitoring
- Displays:
  - AQI  
  - PM2.5  
  - PM10  
  - Ozone  
  - Nitrogen dioxide  
- Updates with local timestamp  

### Fire Activity Analysis
- Total number of detections  
- Distance to closest hotspot  
- Activity level classification:
  - Low  
  - Moderate  
  - High  

### Smoke Impact Screening
- Combines fire data with PM2.5 levels  
- Generates simple interpretation:
  - No impact  
  - Possible influence  
  - Elevated concern  

### 24 Hour Trend
- PM2.5 forecast visualization  
- Helps identify worsening conditions  

---

## Project Structure

- index.html → dashboard layout and UI :contentReference[oaicite:2]{index=2}  
- script.js → data fetching, wildfire analysis, interpretation logic :contentReference[oaicite:3]{index=3}  
- style.css → full layout and design system :contentReference[oaicite:4]{index=4}  

---

## Why I built this

Wildfire smoke is a growing environmental issue.

Most tools separate:
- Fire detection data  
- Air quality data  

This project connects both into one system.
