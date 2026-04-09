// -----------------------------
// Wildfire Impact Monitor
// -----------------------------
const FIRMS_KEY_STORAGE = "wildfire-monitor-firms-map-key";
const FIRMS_SOURCE = "VIIRS_NOAA20_NRT";
const FIRMS_DAY_RANGE = 1;
const DEFAULT_CITY = "Houston, Texas";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";

const cityInput = document.getElementById("cityInput");
const citySuggestions = document.getElementById("citySuggestions");
const searchBtn = document.getElementById("searchBtn");
const firmsApiKeyInput = document.getElementById("firmsApiKeyInput");
const errorMessage = document.getElementById("errorMessage");

const selectedCityTitle = document.getElementById("selectedCityTitle");
const selectedCityMeta = document.getElementById("selectedCityMeta");
const briefingTime = document.getElementById("briefingTime");

const statusCity = document.getElementById("statusCity");
const statusAir = document.getElementById("statusAir");
const statusFire = document.getElementById("statusFire");

const aqiCard = document.getElementById("aqiCard");
const aqiValue = document.getElementById("aqiValue");
const aqiCategory = document.getElementById("aqiCategory");
const pm25Value = document.getElementById("pm25Value");
const pm10Value = document.getElementById("pm10Value");
const ozoneValue = document.getElementById("ozoneValue");
const no2Value = document.getElementById("no2Value");
const lastUpdatedValue = document.getElementById("lastUpdatedValue");

const fireCountValue = document.getElementById("fireCountValue");
const closestFireValue = document.getElementById("closestFireValue");
const fireLevelValue = document.getElementById("fireLevelValue");
const fireDateRangeValue = document.getElementById("fireDateRangeValue");

const impactText = document.getElementById("impactText");

let map;
let cityLayer;
let fireLayer;
let pmChart;
let suggestionItems = [];
let activeSuggestionIndex = -1;
let suggestionDebounce;

const US_STATE_ABBR = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC"
};

// -----------------------------
// Initialization
// -----------------------------
initMap();
bindEvents();
loadStoredFirmsKey();
if (briefingTime) {
  briefingTime.textContent = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());
}
searchCityAndUpdate(DEFAULT_CITY);

function bindEvents() {
  searchBtn.addEventListener("click", () => searchCityAndUpdate(cityInput.value.trim()));
  if (firmsApiKeyInput) {
    firmsApiKeyInput.addEventListener("input", () => saveFirmsKey(firmsApiKeyInput.value));
  }

  cityInput.addEventListener("input", onCityInputChange);
  cityInput.addEventListener("focus", () => {
    if (suggestionItems.length) {
      citySuggestions.classList.add("show");
    }
  });

  cityInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && suggestionItems.length) {
      event.preventDefault();
      moveActiveSuggestion(1);
      return;
    }

    if (event.key === "ArrowUp" && suggestionItems.length) {
      event.preventDefault();
      moveActiveSuggestion(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestionItems.length && activeSuggestionIndex >= 0) {
        selectSuggestion(suggestionItems[activeSuggestionIndex]);
        return;
      }
      searchCityAndUpdate(cityInput.value.trim());
      hideSuggestions();
    }
  });

  document.addEventListener("click", (event) => {
    const insideSearch = event.target.closest(".search-input-wrap");
    if (!insideSearch) {
      hideSuggestions();
    }
  });
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([29.7604, -95.3698], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  cityLayer = L.layerGroup().addTo(map);
  fireLayer = L.layerGroup().addTo(map);
}

// -----------------------------
// Main search flow
// -----------------------------
async function searchCityAndUpdate(query) {
  clearError();
  if (!query) {
    showError("Please enter a city name.");
    return;
  }

  setStatus(statusCity, "loading", "City search: loading");
  setStatus(statusAir, "idle", "Air: waiting");
  setStatus(statusFire, "idle", "Fire: waiting");
  searchBtn.disabled = true;
  searchBtn.textContent = "Running...";

  try {
    const city = await fetchCityCoordinates(query);
    if (!city) {
      throw new Error("City not found. Try adding a state name, like Austin, Texas.");
    }

    updateCityHeader(city);
    renderCityOnMap(city);
    setStatus(statusCity, "success", "City search: complete");

    const airData = await fetchAirQuality(city);
    updateAirQualityUI(airData);
    renderPm25Chart(airData.hourly);

    try {
      const fireData = await fetchWildfires(city);
      updateWildfireUI(city, fireData);
      updateImpactInterpretation(airData, fireData);
    } catch (fireError) {
      updateWildfireUnavailableUI();
      updateImpactInterpretation(airData, [], fireError.message);
      showError(fireError.message || "Wildfire detections are unavailable right now.");
    }
  } catch (error) {
    showError(error.message || "Something went wrong while loading data.");
    setStatus(statusCity, "error", "City search: failed");
    if (!statusAir.classList.contains("success")) {
      setStatus(statusAir, "error", "Air: failed");
    }
    if (!statusFire.classList.contains("success")) {
      setStatus(statusFire, "error", "Fire: failed");
    }
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = "Run";
  }
}

// -----------------------------
// Geocoding
// -----------------------------
async function fetchCityCoordinates(query) {
  const matches = await fetchCityMatches(query, 10);
  return matches[0] || null;
}

async function fetchCityMatches(query, count = 8) {
  const parsed = parseCityQuery(query);
  const params = new URLSearchParams({
    name: parsed.namePart,
    count: String(count),
    language: "en",
    format: "json",
    countryCode: "US"
  });

  const response = await fetch(`${GEOCODE_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("City search service is unavailable right now.");
  }

  const data = await response.json();
  const results = (data.results || []).filter((item) => item.country_code === "US");
  if (!results.length) {
    return [];
  }

  return results
    .map((city) => {
      const state = city.admin1 || "Unknown State";
      const stateMatchScore = scoreStateMatch(parsed.stateHint, state);
      return {
        name: city.name,
        state,
        country: city.country || "United States",
        latitude: Number(city.latitude),
        longitude: Number(city.longitude),
        timezone: city.timezone || "auto",
        population: Number(city.population) || 0,
        score: stateMatchScore
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.population - a.population;
    });
}

function updateCityHeader(city) {
  selectedCityTitle.textContent = `Selected City: ${city.name}, ${city.state}`;
  selectedCityMeta.textContent = `Coordinates: ${city.latitude.toFixed(3)}, ${city.longitude.toFixed(3)} (${city.country})`;
}

async function onCityInputChange() {
  const query = cityInput.value.trim();
  clearError();
  activeSuggestionIndex = -1;

  if (query.length < 2) {
    hideSuggestions();
    return;
  }

  clearTimeout(suggestionDebounce);
  suggestionDebounce = setTimeout(async () => {
    try {
      const matches = await fetchCityMatches(query, 7);
      if (!matches.length) {
        hideSuggestions();
        return;
      }
      suggestionItems = matches;
      renderSuggestions(matches);
    } catch {
      hideSuggestions();
    }
  }, 250);
}

function renderSuggestions(matches) {
  citySuggestions.innerHTML = "";
  activeSuggestionIndex = -1;

  matches.forEach((city, index) => {
    const item = document.createElement("li");
    item.className = "suggestion-item";
    item.setAttribute("role", "option");
    item.setAttribute("data-index", String(index));
    item.innerHTML = `
      <span class="suggestion-main">${city.name}, ${city.state}</span>
      <span class="suggestion-sub">${city.latitude.toFixed(2)}, ${city.longitude.toFixed(2)}</span>
    `;

    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectSuggestion(city);
    });

    citySuggestions.appendChild(item);
  });

  citySuggestions.classList.add("show");
}

function moveActiveSuggestion(direction) {
  if (!suggestionItems.length) return;

  activeSuggestionIndex = (activeSuggestionIndex + direction + suggestionItems.length) % suggestionItems.length;
  const elements = citySuggestions.querySelectorAll(".suggestion-item");
  elements.forEach((el) => el.classList.remove("active"));
  const activeEl = elements[activeSuggestionIndex];
  if (activeEl) {
    activeEl.classList.add("active");
    activeEl.scrollIntoView({ block: "nearest" });
  }
}

function selectSuggestion(city) {
  cityInput.value = `${city.name}, ${city.state}`;
  hideSuggestions();
  searchCityAndUpdate(cityInput.value);
}

function hideSuggestions() {
  suggestionItems = [];
  activeSuggestionIndex = -1;
  citySuggestions.classList.remove("show");
  citySuggestions.innerHTML = "";
}

// -----------------------------
// Air quality
// -----------------------------
async function fetchAirQuality(city) {
  setStatus(statusAir, "loading", "Air: loading");

  const params = new URLSearchParams({
    latitude: city.latitude.toString(),
    longitude: city.longitude.toString(),
    current: "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide",
    hourly: "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide",
    forecast_days: "2",
    timezone: "auto"
  });

  const response = await fetch(`${AIR_QUALITY_URL}?${params.toString()}`);
  if (!response.ok) {
    setStatus(statusAir, "error", "Air: failed");
    throw new Error("Air quality data could not be loaded.");
  }

  const data = await response.json();
  if (!data.current || !data.hourly) {
    setStatus(statusAir, "error", "Air: incomplete");
    throw new Error("Air quality response is missing required fields.");
  }

  setStatus(statusAir, "success", "Air: complete");
  return {
    current: data.current,
    hourly: extractNext24Hours(data.hourly)
  };
}

function updateAirQualityUI(airData) {
  const current = airData.current;
  const aqi = parseNumber(current.us_aqi);

  aqiValue.textContent = formatMaybeNumber(aqi, 0);
  pm25Value.textContent = formatMaybeNumber(parseNumber(current.pm2_5), 1);
  pm10Value.textContent = formatMaybeNumber(parseNumber(current.pm10), 1);
  ozoneValue.textContent = formatMaybeNumber(parseNumber(current.ozone), 1);
  no2Value.textContent = formatMaybeNumber(parseNumber(current.nitrogen_dioxide), 1);
  lastUpdatedValue.textContent = formatDateTime(current.time);
  if (briefingTime) {
    briefingTime.textContent = formatDateTime(current.time);
  }

  const category = getAqiCategory(aqi);
  aqiCategory.textContent = category.label;
  applyAqiClass(category.className);
}

function extractNext24Hours(hourly) {
  const times = hourly.time || [];
  const pm25 = hourly.pm2_5 || [];
  const limit = Math.min(24, times.length, pm25.length);

  return {
    time: times.slice(0, limit),
    pm2_5: pm25.slice(0, limit)
  };
}

function getAqiCategory(aqi) {
  if (!Number.isFinite(aqi)) {
    return { label: "Category unavailable", className: "" };
  }
  if (aqi <= 50) return { label: "Good", className: "aqi-good" };
  if (aqi <= 100) return { label: "Moderate", className: "aqi-moderate" };
  if (aqi <= 150) return { label: "Unhealthy for Sensitive Groups", className: "aqi-sensitive" };
  if (aqi <= 200) return { label: "Unhealthy", className: "aqi-unhealthy" };
  return { label: "Very Unhealthy / Hazardous", className: "aqi-very-unhealthy" };
}

function applyAqiClass(className) {
  const classes = ["aqi-good", "aqi-moderate", "aqi-sensitive", "aqi-unhealthy", "aqi-very-unhealthy"];
  aqiCard.classList.remove(...classes);
  if (className) {
    aqiCard.classList.add(className);
  }
}

// -----------------------------
// Wildfire data and analysis
// -----------------------------
async function fetchWildfires(city) {
  setStatus(statusFire, "loading", "Fire: loading");
  const firmsMapKey = getFirmsKey();

  if (!firmsMapKey) {
    setStatus(statusFire, "error", "Fire: missing MAP_KEY");
    throw new Error("NASA FIRMS MAP_KEY is missing. Paste your key into the textbox to enable wildfire detections.");
  }

  const bounds = buildBoundingBox(city.latitude, city.longitude, 1.8);
  const area = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const url = `${FIRMS_BASE_URL}/${firmsMapKey}/${FIRMS_SOURCE}/${encodeURIComponent(area)}/${FIRMS_DAY_RANGE}`;

  const response = await fetch(url);
  if (!response.ok) {
    setStatus(statusFire, "error", "Fire: failed");
    throw new Error("Wildfire detection data could not be loaded from NASA FIRMS.");
  }

  const csvText = await response.text();
  const detections = parseFirmsCsv(csvText);

  setStatus(statusFire, "success", "Fire: complete");
  return detections;
}

function parseFirmsCsv(csvText) {
  const rows = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) {
    return [];
  }

  const header = parseCsvLine(rows[0]).map((item) => item.trim());
  const detections = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cells = parseCsvLine(rows[i]);
    if (!cells.length) continue;

    const record = {};
    header.forEach((key, index) => {
      record[key] = (cells[index] || "").trim();
    });

    const lat = parseNumber(getByKeys(record, ["latitude", "lat"]));
    const lon = parseNumber(getByKeys(record, ["longitude", "lon", "long"]));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    detections.push({
      latitude: lat,
      longitude: lon,
      brightness: getByKeys(record, ["brightness", "bright_ti4", "bright_t31"]),
      confidence: getByKeys(record, ["confidence"]),
      acqDate: getByKeys(record, ["acq_date", "date"]),
      acqTime: getByKeys(record, ["acq_time", "time"]),
      raw: record
    });
  }

  return detections;
}

function parseCsvLine(line) {
  const output = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      output.push(current);
      current = "";
      continue;
    }

    current += char;
  }
  output.push(current);
  return output;
}

function updateWildfireUI(city, detections) {
  renderWildfiresOnMap(city, detections);

  const distances = detections.map((fire) =>
    haversineMiles(city.latitude, city.longitude, fire.latitude, fire.longitude)
  );
  const closest = distances.length ? Math.min(...distances) : null;

  fireCountValue.textContent = String(detections.length);
  closestFireValue.textContent = Number.isFinite(closest) ? `${closest.toFixed(1)} miles` : "No nearby detections";
  fireLevelValue.textContent = getFireActivityLevel(detections.length, closest);
  fireDateRangeValue.textContent = "Last 1 day (recent NRT detections)";
}

function updateWildfireUnavailableUI() {
  fireLayer.clearLayers();
  fireCountValue.textContent = "--";
  closestFireValue.textContent = "Unavailable";
  fireLevelValue.textContent = "Unavailable";
  fireDateRangeValue.textContent = "Last 1 day target window";
}

function getFireActivityLevel(count, closestDistance) {
  if (count === 0) return "Low";
  if (count < 5 && (!Number.isFinite(closestDistance) || closestDistance > 60)) return "Low";
  if (count >= 12 || (Number.isFinite(closestDistance) && closestDistance <= 30)) return "High";
  return "Moderate";
}

// -----------------------------
// Map rendering
// -----------------------------
function renderCityOnMap(city) {
  cityLayer.clearLayers();
  fireLayer.clearLayers();

  const cityMarker = L.circleMarker([city.latitude, city.longitude], {
    radius: 9,
    color: "#ffffff",
    weight: 2,
    fillColor: "#007a63",
    fillOpacity: 0.95
  }).bindPopup(`<strong>${city.name}, ${city.state}</strong><br/>City center`);

  cityLayer.addLayer(cityMarker);
  map.setView([city.latitude, city.longitude], 8);
}

function renderWildfiresOnMap(city, detections) {
  fireLayer.clearLayers();

  detections.forEach((fire) => {
    const confidenceText = fire.confidence || "N/A";
    const popup = `
      <strong>Wildfire Detection</strong><br/>
      Brightness: ${fire.brightness || "N/A"}<br/>
      Confidence: ${confidenceText}<br/>
      Date: ${fire.acqDate || "N/A"} ${fire.acqTime || ""}<br/>
      Coordinates: ${fire.latitude.toFixed(3)}, ${fire.longitude.toFixed(3)}
    `;

    const marker = L.circleMarker([fire.latitude, fire.longitude], {
      radius: markerRadiusFromConfidence(fire.confidence),
      color: "#74210d",
      weight: 1.2,
      fillColor: "#e85a2a",
      fillOpacity: 0.8
    }).bindPopup(popup);

    fireLayer.addLayer(marker);
  });

  const allPoints = [
    [city.latitude, city.longitude],
    ...detections.map((fire) => [fire.latitude, fire.longitude])
  ];

  if (allPoints.length > 1) {
    const bounds = L.latLngBounds(allPoints);
    map.fitBounds(bounds, { padding: [35, 35] });
  }
}

function markerRadiusFromConfidence(confidence) {
  const numeric = parseNumber(confidence);
  if (Number.isFinite(numeric)) {
    if (numeric >= 80) return 7;
    if (numeric >= 50) return 6;
    return 5;
  }

  if (typeof confidence === "string") {
    const value = confidence.toLowerCase();
    if (value.includes("high")) return 7;
    if (value.includes("nominal")) return 6;
  }
  return 5;
}

// -----------------------------
// Chart rendering
// -----------------------------
function renderPm25Chart(hourly) {
  const canvas = document.getElementById("pmChart");
  const labels = (hourly.time || []).map(formatHourLabel);
  const values = (hourly.pm2_5 || []).map((v) => parseNumber(v));

  if (pmChart) {
    pmChart.destroy();
  }

  pmChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "PM2.5 (µg/m³)",
          data: values,
          borderColor: "#12756a",
          backgroundColor: "rgba(18, 117, 106, 0.15)",
          fill: true,
          tension: 0.25,
          pointRadius: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const y = context.parsed.y;
              return ` PM2.5: ${Number.isFinite(y) ? y.toFixed(1) : "--"} µg/m³`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Time (Local)" }
        },
        y: {
          title: { display: true, text: "PM2.5 (µg/m³)" },
          beginAtZero: true
        }
      }
    }
  });
}

// -----------------------------
// Interpretation logic
// -----------------------------
function updateImpactInterpretation(airData, fires, wildfireError = "") {
  if (wildfireError) {
    impactText.textContent =
      "Wildfire detections are currently unavailable, so this screening can only reflect local air quality signals. Paste a valid NASA FIRMS MAP_KEY into the textbox to enable wildfire-linked interpretation.";
    return;
  }

  const aqi = parseNumber(airData.current.us_aqi);
  const pm25 = parseNumber(airData.current.pm2_5);
  const fireCount = fires.length;

  let message = "Screening-level interpretation is unavailable because required data is missing.";

  if (fireCount === 0 && aqi <= 50 && pm25 <= 12) {
    message =
      "Low likely smoke impact right now. No nearby wildfire detections were found in the search area, and local AQI/PM2.5 levels are in a healthy range.";
  } else if (fireCount > 0 && pm25 <= 12) {
    message =
      "Nearby wildfire detections are present, but local PM2.5 remains low. This suggests no clear local smoke effect at this time, though conditions can change.";
  } else if (fireCount > 0 && pm25 > 12) {
    message =
      "Possible smoke influence is present. Wildfire detections were found in the surrounding area and PM2.5 is elevated compared with cleaner baseline conditions.";
  }

  if (fireCount >= 5 && (aqi > 100 || pm25 >= 35)) {
    message =
      "Elevated smoke impact concern. Multiple regional wildfire detections and unhealthy local air signals suggest stronger potential for smoke-related air quality effects.";
  }

  if (fireCount === 0 && aqi > 100) {
    message =
      "Air quality is currently unhealthy, but this screen did not detect nearby wildfire hotspots. Other pollution sources or regional transport may be contributing.";
  }

  impactText.textContent = `${message} This is an educational screening result and does not provide direct source attribution.`;
}

function loadStoredFirmsKey() {
  if (!firmsApiKeyInput) return;
  firmsApiKeyInput.value = getFirmsKey();
}

function getFirmsKey() {
  try {
    return localStorage.getItem(FIRMS_KEY_STORAGE)?.trim() || "";
  } catch (error) {
    return firmsApiKeyInput ? firmsApiKeyInput.value.trim() : "";
  }
}

function saveFirmsKey(value) {
  const trimmedValue = value.trim();

  try {
    if (trimmedValue) {
      localStorage.setItem(FIRMS_KEY_STORAGE, trimmedValue);
    } else {
      localStorage.removeItem(FIRMS_KEY_STORAGE);
    }
  } catch (error) {
    // Ignore storage failures and continue using the current field value.
  }
}

// -----------------------------
// Utility functions
// -----------------------------
function buildBoundingBox(lat, lon, delta) {
  return {
    west: clamp(lon - delta, -180, 180).toFixed(3),
    south: clamp(lat - delta, -90, 90).toFixed(3),
    east: clamp(lon + delta, -180, 180).toFixed(3),
    north: clamp(lat + delta, -90, 90).toFixed(3)
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function formatMaybeNumber(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatDateTime(isoString) {
  if (!isoString) return "--";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatHourLabel(isoString) {
  if (!isoString) return "--";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getByKeys(record, keys) {
  const lowered = {};
  Object.keys(record).forEach((key) => {
    lowered[key.toLowerCase()] = record[key];
  });
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(lowered, key.toLowerCase())) {
      return lowered[key.toLowerCase()];
    }
  }
  return "";
}

function parseCityQuery(rawQuery) {
  const cleaned = rawQuery.trim().replace(/\s+/g, " ");
  const commaParts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (commaParts.length >= 2) {
    return {
      namePart: commaParts[0],
      stateHint: commaParts[1]
    };
  }

  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length >= 2) {
    const lastToken = tokens[tokens.length - 1].toLowerCase();
    if (lastToken.length === 2 || US_STATE_ABBR[lastToken]) {
      return {
        namePart: tokens.slice(0, -1).join(" "),
        stateHint: tokens[tokens.length - 1]
      };
    }
  }

  return {
    namePart: cleaned,
    stateHint: ""
  };
}

function scoreStateMatch(stateHint, candidateState) {
  if (!stateHint) return 0;
  const hint = normalizeStateToken(stateHint);
  const candidate = normalizeStateToken(candidateState);

  if (!hint || !candidate) return 0;

  if (hint === candidate) return 4;

  const hintAbbr = toStateAbbr(hint);
  const candidateAbbr = toStateAbbr(candidate);
  if (hintAbbr && candidateAbbr && hintAbbr === candidateAbbr) return 3;
  if (candidate.includes(hint) || hint.includes(candidate)) return 2;
  return 0;
}

function normalizeStateToken(text) {
  return String(text).toLowerCase().replace(/\./g, "").trim();
}

function toStateAbbr(stateToken) {
  if (stateToken.length === 2) return stateToken.toUpperCase();
  return US_STATE_ABBR[stateToken] || "";
}

function setStatus(el, type, text) {
  el.classList.remove("loading", "error", "success");
  if (type === "loading" || type === "error" || type === "success") {
    el.classList.add(type);
  }
  el.textContent = text;
}

function showError(message) {
  errorMessage.textContent = message;
}

function clearError() {
  errorMessage.textContent = "";
}
