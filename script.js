// Elements
const errorMessage = document.getElementById('error-message');
const weatherMain = document.getElementById('weather-main');
const loadingSpinner = document.getElementById('loading-spinner');

function calculateDisplayHourlyCount() {
    // Each hourly card is approx 120px + 16px gap = 136px.
    // Subtract some padding for container margins (approx 48px).
    const availableWidth = window.innerWidth - 48;
    let count = Math.floor(availableWidth / 136);
    // Ensure we show at least 4 hours and at most 24
    if (count < 4) count = 4;
    if (count > 24) count = 24;
    return count;
}

// State
let currentUnit = 'C';
let weatherDataCache = null;
let currentModel = 'gem_seamless';
let displayHourlyCount = calculateDisplayHourlyCount();
let searchTimeout = null;

let userLat = null;
let userLon = null;

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;  
    const dLon = (lon2 - lon1) * Math.PI / 180; 
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

function convertTemp(tempC) {
    if (currentUnit === 'F') {
        return (tempC * 9/5) + 32;
    }
    return tempC;
}

function setUnit(unit) {
    if (currentUnit === unit) return;
    currentUnit = unit;
    
    const btnC = document.getElementById('btn-celsius');
    const btnF = document.getElementById('btn-fahrenheit');
    if (btnC && btnF) {
        if (unit === 'C') {
            btnC.className = 'px-3 py-1 bg-white shadow-sm rounded-full text-xs font-bold text-primary transition-colors';
            btnF.className = 'px-3 py-1 text-xs font-bold text-outline hover:text-primary transition-colors';
        } else {
            btnF.className = 'px-3 py-1 bg-white shadow-sm rounded-full text-xs font-bold text-primary transition-colors';
            btnC.className = 'px-3 py-1 text-xs font-bold text-outline hover:text-primary transition-colors';
        }
    }
    
    if (weatherDataCache) {
        updateWeatherCard(weatherDataCache);
    }
}

// Current Location Data
let currentLat = 49.2238;
let currentLon = -122.6893;
let currentElevation = 12;
let currentCityName = "Pitt Meadows";

// Open-Meteo WMO Weather codes (Mapped to Emojis)
const weatherCodes = {
    0: { condition: 'Clear sky', icon: '☀️', nightIcon: '🌙' },
    1: { condition: 'Mainly clear', icon: '🌤️', nightIcon: '🌙' },
    2: { condition: 'Partly cloudy', icon: '⛅', nightIcon: '☁️' },
    3: { condition: 'Overcast', icon: '☁️', nightIcon: '☁️' },
    45: { condition: 'Fog', icon: '🌫️', nightIcon: '🌫️' },
    48: { condition: 'Depositing rime fog', icon: '🌫️', nightIcon: '🌫️' },
    51: { condition: 'Light drizzle', icon: '🌧️', nightIcon: '🌧️' },
    53: { condition: 'Moderate drizzle', icon: '🌧️', nightIcon: '🌧️' },
    55: { condition: 'Dense drizzle', icon: '🌧️', nightIcon: '🌧️' },
    61: { condition: 'Slight rain', icon: '🌧️', nightIcon: '🌧️' },
    63: { condition: 'Moderate rain', icon: '🌧️', nightIcon: '🌧️' },
    65: { condition: 'Heavy rain', icon: '🌧️', nightIcon: '🌧️' },
    71: { condition: 'Slight snow', icon: '❄️', nightIcon: '❄️' },
    73: { condition: 'Moderate snow', icon: '❄️', nightIcon: '❄️' },
    75: { condition: 'Heavy snow', icon: '❄️', nightIcon: '❄️' },
    77: { condition: 'Snow grains', icon: '❄️', nightIcon: '❄️' },
    80: { condition: 'Slight rain showers', icon: '🌦️', nightIcon: '🌧️' },
    81: { condition: 'Moderate rain showers', icon: '🌦️', nightIcon: '🌧️' },
    82: { condition: 'Violent rain showers', icon: '🌦️', nightIcon: '🌧️' },
    85: { condition: 'Slight snow showers', icon: '🌨️', nightIcon: '🌨️' },
    86: { condition: 'Heavy snow showers', icon: '🌨️', nightIcon: '🌨️' },
    95: { condition: 'Thunderstorm', icon: '⛈️', nightIcon: '⛈️' },
    96: { condition: 'Thunderstorm with slight hail', icon: '⛈️', nightIcon: '⛈️' },
    99: { condition: 'Thunderstorm with heavy hail', icon: '⛈️', nightIcon: '⛈️' }
};

const funWeatherDescriptions = {
    0: 'Not a cloud in sight!',
    1: 'Mostly sunny & sweet',
    2: 'A little cloudy, still nice',
    3: 'Grey skies today',
    45: 'Foggy & mysterious',
    48: 'Chilly, frosty fog',
    51: 'Just a light sprinkle',
    53: 'Steady drizzle',
    55: 'Heavy drizzle, grab a coat',
    61: 'A little rain coming down',
    63: 'Classic rainy day',
    65: 'Pouring buckets out there!',
    71: 'A magical light snow',
    73: 'Snowing pretty good!',
    75: 'Heavy snow! Snowball fight?',
    77: 'Tiny snow grains falling',
    80: 'Passing rain showers',
    81: 'Showers on and off',
    82: 'Intense rain showers!',
    85: 'Quick flurry of snow',
    86: 'Heavy snow showers',
    95: 'Thunder & lightning!',
    96: 'Thunderstorm with a bit of hail',
    99: 'Wild storm with heavy hail!'
};

const defaultWeather = { condition: 'Unknown', icon: '❓', nightIcon: '❓' };

// Day/Night helper: determines if a given time is nighttime based on sunrise/sunset
function isNighttime(dateStr, dailyData) {
    if (!dailyData || !dailyData.sunrise || !dailyData.sunset) return false;
    const dateObj = new Date(dateStr);
    const dateOnly = dateStr.substring(0, 10); // "YYYY-MM-DD"
    
    // Find the matching day in daily data
    for (let d = 0; d < dailyData.time.length; d++) {
        if (dailyData.time[d] === dateOnly) {
            const sunrise = new Date(dailyData.sunrise[d]);
            const sunset = new Date(dailyData.sunset[d]);
            return dateObj < sunrise || dateObj >= sunset;
        }
    }
    // If no matching day found, use a simple heuristic (before 6 AM or after 9 PM)
    const hour = dateObj.getHours();
    return hour < 6 || hour >= 21;
}

function getWeatherIcon(weatherCode, dateStr, dailyData) {
    const info = weatherCodes[weatherCode] || defaultWeather;
    if (isNighttime(dateStr, dailyData)) {
        return info.nightIcon || info.icon;
    }
    return info.icon;
}

// Helpers
const formatHour = (dateString) => {
    const date = new Date(dateString);
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    return `${hours} ${ampm}`;
};

const formatShortDate = (dateString) => {
    const date = new Date(dateString);
    const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return localDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getLongDay = (dateString) => {
    const date = new Date(dateString);
    const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return localDate.toLocaleDateString('en-US', { weekday: 'long' });
};

const getShortDayDate = (dateString) => {
    const date = new Date(dateString);
    const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    const day = localDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const month = localDate.getMonth() + 1;
    const d = localDate.getDate();
    return { day, date: `${month}/${d}` };
};

const getWindDirectionStr = (degrees) => {
    const val = Math.floor((degrees / 22.5) + 0.5);
    const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return arr[(val % 16)];
};

const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const getAqiDescription = (aqi) => {
    if (aqi <= 50) return { text: 'GOOD', color: 'text-green-600' };
    if (aqi <= 100) return { text: 'MODERATE', color: 'text-yellow-600' };
    if (aqi <= 150) return { text: 'UNHEALTHY (SG)', color: 'text-orange-500' };
    if (aqi <= 200) return { text: 'UNHEALTHY', color: 'text-red-500' };
    if (aqi <= 300) return { text: 'VERY UNHEALTHY', color: 'text-purple-600' };
    return { text: 'HAZARDOUS', color: 'text-rose-900' };
};

function getModelData(weatherData, modelKey) {
    if (!weatherData) return null;
    
    // If the key is missing from multi-model response, fall back to ECMWF (the most reliable)
    const suffix = `_${modelKey}`;
    const h = weatherData.hourly;
    const d = weatherData.daily;

    // Check if hourly data exists for this model
    if (!h || !h[`temperature_2m${suffix}`]) {
        // Fallback to ECMWF if the requested model data is missing
        if (modelKey !== 'ecmwf_ifs') return getModelData(weatherData, 'ecmwf_ifs');
        return weatherData;
    }
    
    return {
        current: weatherData.current,
        hourly: {
            time: h.time,
            temperature_2m: h[`temperature_2m${suffix}`],
            precipitation: h[`precipitation${suffix}`],
            weather_code: h[`weather_code${suffix}`],
            visibility: h[`visibility${suffix}`]
        },
        daily: {
            time: d.time,
            temperature_2m_max: d[`temperature_2m_max${suffix}`],
            temperature_2m_min: d[`temperature_2m_min${suffix}`],
            precipitation_sum: d[`precipitation_sum${suffix}`],
            precipitation_probability_max: d[`precipitation_probability_max${suffix}`],
            weather_code: d[`weather_code${suffix}`],
            sunrise: d[`sunrise${suffix}`],
            sunset: d[`sunset${suffix}`]
        }
    };
}

// Fetch Weather from Open-Meteo
async function getWeather() {
    const modelKeys = [
        "gem_seamless", "gem_global", "gem_regional", "gem_hrdps_continental", "gem_hrdps_west",
        "ecmwf_ifs", "ecmwf_aifs025", "gfs_seamless",
        "ncep_nbm_conus", "gfs_graphcast025", "ncep_aigfs025", "ncep_hgefs025_ensemble_mean",
        "ncep_hrrr_conus", "ncep_nam_conus"
    ];
    const modelsParam = modelKeys.join(",");
    
    // Core parameters for all models
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${currentLat}&longitude=${currentLon}&elevation=${currentElevation}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,visibility,surface_pressure,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation,weather_code,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&models=${modelsParam}&timezone=auto&forecast_days=10`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${currentLat}&longitude=${currentLon}&current=us_aqi&timezone=auto`;
    
    const [weatherRes, aqiRes] = await Promise.all([
        fetch(weatherUrl),
        fetch(aqiUrl)
    ]);
    
    if (!weatherRes.ok || !aqiRes.ok) throw new Error(`Failed to fetch weather/aqi data`);
    
    const weatherData = await weatherRes.json();
    const aqiData = await aqiRes.json();
    
    return { 
        gemSeamlessData: getModelData(weatherData, "gem_seamless"),
        gemGlobalData: getModelData(weatherData, "gem_global"),
        gemRegionalData: getModelData(weatherData, "gem_regional"),
        gemHrdpsData: getModelData(weatherData, "gem_hrdps_continental"),
        gemHrdpsWestData: getModelData(weatherData, "gem_hrdps_west"),
        ecmwfData: getModelData(weatherData, "ecmwf_ifs"),
        ecmwfAifsData: getModelData(weatherData, "ecmwf_aifs025"),
        gfsData: getModelData(weatherData, "gfs_seamless"),
        nbmData: getModelData(weatherData, "ncep_nbm_conus"),
        graphcastData: getModelData(weatherData, "gfs_graphcast025"),
        aiGfsData: getModelData(weatherData, "ncep_aigfs025"),
        hgefsData: getModelData(weatherData, "ncep_hgefs025_ensemble_mean"),
        hrrrData: getModelData(weatherData, "ncep_hrrr_conus"),
        namData: getModelData(weatherData, "ncep_nam_conus"),
        aqiData 
    };
}

let meteogramChartInstance = null;

function renderMeteogram(data) {
    const { 
        gemSeamlessData, gemGlobalData, gemRegionalData, gemHrdpsData, gemHrdpsWestData, 
        ecmwfData, ecmwfAifsData, gfsData, 
        nbmData, graphcastData, aiGfsData, hgefsData,
        hrrrData, namData 
    } = data;
    const canvas = document.getElementById('meteogram-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    const hourlyTime = ecmwfData.hourly.time;
    const now = new Date();
    let currentHourIdx = 0;
    for (let i = 0; i < hourlyTime.length; i++) {
        if (new Date(hourlyTime[i]) >= now) {
            currentHourIdx = i;
            break;
        }
    }

    const labels = [];
    const temperatures = [];
    const precipitations = [];
    const icons = [];
    const midnightIndices = []; // Track midnight positions for vertical lines
    
    const hoursToPlot = Math.min(240, hourlyTime.length - currentHourIdx);
    
    for (let i = currentHourIdx; i < currentHourIdx + hoursToPlot; i++) {
        const timeStr = hourlyTime[i];
        
        // Model Selection Logic
        let sourceData;
        if (currentModel === 'gem_seamless') sourceData = gemSeamlessData;
        else if (currentModel === 'gem_global') sourceData = gemGlobalData;
        else if (currentModel === 'gem_regional') sourceData = gemRegionalData;
        else if (currentModel === 'gem_hrdps') sourceData = gemHrdpsData;
        else if (currentModel === 'gem_hrdps_west') sourceData = gemHrdpsWestData;
        else if (currentModel === 'ecmwf') sourceData = ecmwfData;
        else if (currentModel === 'ecmwf_aifs') sourceData = ecmwfAifsData;
        else if (currentModel === 'gfs') sourceData = gfsData;
        else if (currentModel === 'ncep_nbm') sourceData = nbmData;
        else if (currentModel === 'graphcast') sourceData = graphcastData;
        else if (currentModel === 'ai_gfs') sourceData = aiGfsData;
        else if (currentModel === 'hgefs') sourceData = hgefsData;
        else if (currentModel === 'hrrr') sourceData = hrrrData;
        else if (currentModel === 'nam') sourceData = namData;
        else {
            // Seamless: GEM for first 3 days (72h), ECMWF for the rest
            const hoursFromNow = i - currentHourIdx;
            const useGem = hoursFromNow < 72 && i < gemData.hourly.time.length;
            sourceData = useGem ? gemData : ecmwfData;
        }
        
        // Fallback check: if model data ends (like HRRR), use ECMWF
        if (!sourceData.hourly.temperature_2m[i] && i < ecmwfData.hourly.temperature_2m.length) {
            sourceData = ecmwfData;
        }
        
        // Push data
        const dateObj = new Date(timeStr);
        const plotIndex = i - currentHourIdx;
        // Track midnight boundaries for vertical lines and day labels
        const isMidnight = dateObj.getHours() === 0;
        if (isMidnight) {
             midnightIndices.push({ index: plotIndex, dayName: getLongDay(timeStr) });
        }
        labels.push('');
        
        const tArr = sourceData.hourly.temperature_2m;
        temperatures.push(tArr ? convertTemp(tArr[i]) : 0);
        
        const pArr = sourceData.hourly.precipitation;
        precipitations.push(pArr ? (pArr[i] || 0) : 0);
        
        const wCode = sourceData.hourly.weather_code ? sourceData.hourly.weather_code[i] : 0;
        const dailyForIcon = sourceData.daily || ecmwfData.daily;
        const iconName = getWeatherIcon(wCode, timeStr, dailyForIcon);
        
        if (dateObj.getHours() % 6 === 0) {
            icons.push(iconName);
        } else {
            icons.push(null);
        }
    }

    // Capture the starting day name (the partial first day)
    const startDayName = getLongDay(hourlyTime[currentHourIdx]);

    if (meteogramChartInstance) {
        meteogramChartInstance.destroy();
    }

    meteogramChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            weatherIcons: icons,
            midnightIndices: midnightIndices,
            startDayName: startDayName,
            datasets: [
                {
                    label: `Temperature (°${currentUnit})`,
                    data: temperatures,
                    borderColor: '#3b82f6', // blue-500
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Precipitation (mm)',
                    data: precipitations,
                    type: 'bar',
                    backgroundColor: 'rgba(148, 163, 184, 0.5)', // slate-400
                    borderWidth: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            layout: {
                padding: {
                    top: 40,
                    bottom: 24
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: {
                            family: 'Manrope',
                            size: 12
                        }
                    }
                },
                tooltip: {
                    titleFont: { family: 'Manrope' },
                    bodyFont: { family: 'Manrope' }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: false
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: `Temperature (°${currentUnit})`,
                        font: { family: 'Manrope', size: 12 }
                    },
                    grid: {
                        color: '#f1f5f9'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Precipitation (mm)',
                        font: { family: 'Manrope', size: 12 }
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    min: 0,
                    suggestedMax: 10 // scale precipitation so it doesn't dominate the chart
                }
            }
        },
        plugins: [{
            id: 'midnightLinesAndLabelsPlugin',
            beforeDatasetsDraw(chart) {
                const { ctx, data, chartArea, scales } = chart;
                const entries = data.midnightIndices;
                if (!entries || entries.length === 0) return;
                
                const xScale = scales.x;
                
                // Draw vertical dashed lines at midnight
                ctx.save();
                ctx.strokeStyle = '#cbd5e1'; // slate-300
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                
                const midnightXPositions = entries.map(e => xScale.getPixelForValue(e.index));
                midnightXPositions.forEach(x => {
                    ctx.beginPath();
                    ctx.moveTo(x, chartArea.top);
                    ctx.lineTo(x, chartArea.bottom);
                    ctx.stroke();
                });
                ctx.restore();
                
                // Draw day labels centered between midnight lines
                ctx.save();
                ctx.font = 'bold 11px Manrope, sans-serif';
                ctx.fillStyle = '#334155'; // slate-700
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                
                const labelY = chartArea.bottom + 8;
                
                // First partial day: from chart left edge to first midnight
                if (midnightXPositions.length > 0) {
                    const firstCenterX = (chartArea.left + midnightXPositions[0]) / 2;
                    ctx.fillText(data.startDayName || 'Today', firstCenterX, labelY);
                }
                
                // Each subsequent day: between consecutive midnight lines
                for (let i = 0; i < entries.length; i++) {
                    const leftX = midnightXPositions[i];
                    const rightX = (i < midnightXPositions.length - 1) ? midnightXPositions[i + 1] : chartArea.right;
                    const centerX = (leftX + rightX) / 2;
                    ctx.fillText(entries[i].dayName, centerX, labelY);
                }
                
                ctx.restore();
            }
        }, {
            id: 'weatherIconsPlugin',
            afterDatasetsDraw(chart) {
                const { ctx, data } = chart;
                ctx.save();
                ctx.font = '24px sans-serif'; // system font for emojis
                ctx.fillStyle = '#64748b'; // slate-500
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                const meta = chart.getDatasetMeta(0);
                meta.data.forEach((dataPoint, index) => {
                    const iconName = data.weatherIcons[index];
                    if (iconName) {
                        ctx.fillText(iconName, dataPoint.x, dataPoint.y - 25);
                    }
                });
                ctx.restore();
            }
        }]
    });
}

// Update UI
function updateWeatherCard(data) {
    const ecmwfData = data.ecmwfData;
    
    // Model Selection
    let selectedData;
    if (currentModel === 'gem_seamless') selectedData = data.gemSeamlessData;
    else if (currentModel === 'gem_global') selectedData = data.gemGlobalData;
    else if (currentModel === 'gem_regional') selectedData = data.gemRegionalData;
    else if (currentModel === 'gem_hrdps') selectedData = data.gemHrdpsData;
    else if (currentModel === 'gem_hrdps_west') selectedData = data.gemHrdpsWestData;
    else if (currentModel === 'ecmwf') selectedData = data.ecmwfData;
    else if (currentModel === 'ecmwf_aifs') selectedData = data.ecmwfAifsData;
    else if (currentModel === 'gfs') selectedData = data.gfsData;
    else if (currentModel === 'ncep_nbm') selectedData = data.nbmData;
    else if (currentModel === 'graphcast') selectedData = data.graphcastData;
    else if (currentModel === 'ai_gfs') selectedData = data.aiGfsData;
    else if (currentModel === 'hgefs') selectedData = data.hgefsData;
    else if (currentModel === 'hrrr') selectedData = data.hrrrData;
    else if (currentModel === 'nam') selectedData = data.namData;
    else selectedData = data.gemSeamlessData;

    // Use selected data, with ECMWF as fallback if a specific model's top-level object is missing
    const current = selectedData.current || ecmwfData.current;
    const daily = selectedData.daily || ecmwfData.daily;
    const hourly = selectedData.hourly || ecmwfData.hourly;
    
    const wCode = current.weather_code !== undefined ? current.weather_code : ecmwfData.current.weather_code;
    const weatherInfo = weatherCodes[wCode] || defaultWeather;

    // Sunrise / Sunset Source (Astronomical data fallback)
    const sunSource = (daily && daily.sunrise && daily.sunrise[0]) ? daily : ecmwfData.daily;

    // --- Current Hero ---
    const currTempEl = document.getElementById('current-temp');
    if (currTempEl) {
        currTempEl.textContent = `${Math.round(convertTemp(current.temperature_2m))}°`;
        const feelsLikeEl = document.getElementById('current-feels-like');
        if (feelsLikeEl && current.apparent_temperature !== undefined) {
            feelsLikeEl.textContent = `Feels like: ${Math.round(convertTemp(current.apparent_temperature))}°`;
        }
        document.getElementById('current-condition').textContent = weatherInfo.condition;
        // Build a local time string matching Open-Meteo's format (YYYY-MM-DDTHH:MM)
        const _now = new Date();
        const localTimeStr = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}T${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
        document.getElementById('current-icon').textContent = getWeatherIcon(wCode, localTimeStr, sunSource);
        
        const high = daily.temperature_2m_max ? Math.round(convertTemp(daily.temperature_2m_max[0])) : '--';
        const low = daily.temperature_2m_min ? Math.round(convertTemp(daily.temperature_2m_min[0])) : '--';
        document.getElementById('current-range').textContent = `H: ${high}° / L: ${low}°`;
        
        // Precip & Wind
        const precipProb = daily.precipitation_probability_max ? (daily.precipitation_probability_max[0] || 0) : 0;
        document.getElementById('current-precip').textContent = `Precip: ${precipProb}%`;
        document.getElementById('current-wind').textContent = `Wind: ${Math.round(current.wind_speed_10m)}km/h ${getWindDirectionStr(current.wind_direction_10m)}`;
        
        // Humidity and Pressure in Hero
        const currentHumEl = document.getElementById('current-humidity');
        if (currentHumEl) {
            currentHumEl.textContent = `Humidity: ${Math.round(current.relative_humidity_2m)}%`;
        }
        const currentPresEl = document.getElementById('current-pressure');
        if (currentPresEl) {
            const pressureKpa = (current.surface_pressure / 10).toFixed(1);
            currentPresEl.textContent = `Pressure: ${pressureKpa} kPa`;
        }
        
        // Weather Warning
        const warningBtn = document.getElementById('current-warning-btn');
        const warningText = document.getElementById('current-warning-text');
        if (warningBtn && warningText) {
            const isSevere = wCode === 82 || wCode === 86 || wCode >= 95 || current.wind_speed_10m > 40;
            if (isSevere) {
                warningBtn.className = 'flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl shadow-md transition-colors hover:bg-orange-600 cursor-pointer';
                warningText.textContent = 'Weather Warning';
                warningBtn.onclick = () => window.open('https://weather.gc.ca/city/pages/bc-74_metric_e.html', '_blank');
            } else {
                warningBtn.className = 'flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-xl transition-colors cursor-default';
                warningText.textContent = 'No warnings';
                warningBtn.onclick = null;
            }
        }
    }

    // --- Stats Grid Mini ---
    const uvEl = document.getElementById('stat-uv');
    if (uvEl) {
        // Open-Meteo GEM doesn't provide UV easily in this model, so leave placeholder or set to 4
        const uvValue = 4;
        uvEl.textContent = uvValue; 
        const uvDescEl = document.getElementById('stat-uv-desc');
        if (uvDescEl) {
            if (uvValue < 3) uvDescEl.textContent = 'LOW';
            else if (uvValue < 6) uvDescEl.textContent = 'MODERATE';
            else if (uvValue < 8) uvDescEl.textContent = 'HIGH';
            else if (uvValue < 11) uvDescEl.textContent = 'VERY HIGH';
            else uvDescEl.textContent = 'EXTREME';
        }
        
        // Visibility is in meters, convert to km (handle nulls with cross-model fallback)
        let visValue = current.visibility;
        
        // Find the index for the current hour (needed for hourly fallback)
        const _nowVis = new Date();
        let hIdxVis = 0;
        const timeArray = (hourly && hourly.time) ? hourly.time : (data.ecmwfData && data.ecmwfData.hourly ? data.ecmwfData.hourly.time : []);
        for (let i=0; i<timeArray.length; i++) {
            if (new Date(timeArray[i]) >= _nowVis) {
                hIdxVis = i;
                break;
            }
        }

        if (visValue === null || visValue === undefined) {
            // 1. Try selected model's hourly visibility
            if (hourly && hourly.visibility && hourly.visibility[hIdxVis] !== null && hourly.visibility[hIdxVis] !== undefined) {
                visValue = hourly.visibility[hIdxVis];
            }
            // 2. Fallback to GFS hourly visibility (most models don't provide current visibility in multi-model mode)
            else if (data.gfsData && data.gfsData.hourly && data.gfsData.hourly.visibility && data.gfsData.hourly.visibility[hIdxVis] !== null) {
                visValue = data.gfsData.hourly.visibility[hIdxVis];
            }
        }
        
        const visibilityKm = (visValue !== undefined && visValue !== null) ? (visValue / 1000).toFixed(1) : '--';
        document.getElementById('stat-visibility').textContent = `${visibilityKm} km`;

        // Sunrise / Sunset (Already defined sunSource above)
        try {
            if (sunSource && sunSource.sunrise && sunSource.sunrise[0]) {
                const sunriseTime = formatTime(sunSource.sunrise[0]);
                const sunsetTime = formatTime(sunSource.sunset[0]);
                
                const sunriseEl = document.getElementById('stat-sunrise');
                const sunsetEl = document.getElementById('stat-sunset');
                
                if (sunriseEl) sunriseEl.textContent = sunriseTime;
                if (sunsetEl) sunsetEl.textContent = sunsetTime;
            } else {
                console.warn("Sunrise/Sunset data missing in both selected model and ECMWF fallback.");
            }
        } catch (sunErr) {
            console.error("Error formatting sunrise/sunset:", sunErr);
        }

        // Air Quality
        if (data.aqiData && data.aqiData.current) {
            const aqi = data.aqiData.current.us_aqi;
            const aqiInfo = getAqiDescription(aqi);
            const aqiEl = document.getElementById('stat-aqi');
            const aqiDescEl = document.getElementById('stat-aqi-desc');
            if (aqiEl) aqiEl.textContent = aqi;
            if (aqiDescEl) {
                aqiDescEl.textContent = aqiInfo.text;
                aqiDescEl.className = `text-[10px] font-bold mt-1 ${aqiInfo.color}`;
            }
        }
    }

    // --- Hourly Forecast ---
    const hourlyContainer = document.getElementById('hourly-forecast-container');
    if (hourlyContainer) {
        hourlyContainer.innerHTML = '';
        
        // Find current hour index
        const btnFull24h = document.getElementById('btn-full-24h');
        if (btnFull24h) {
            btnFull24h.style.display = displayHourlyCount >= 24 ? 'none' : 'flex';
        }
        const now = new Date();
        // Open-Meteo returns time in ISO format for the timezone.
        let currentHourIdx = 0;
        for (let i=0; i<hourly.time.length; i++) {
            if (new Date(hourly.time[i]) >= now) {
                currentHourIdx = i;
                break;
            }
        }
        
        // Show next N hours
        for (let i = currentHourIdx; i < currentHourIdx + displayHourlyCount; i++) {
            // Check if selected model has data for this specific hour
            let hSource = hourly;
            let idx = i;
            
            // If the selected model ends or has null data for this hour, fallback to ECMWF
            if (i >= hourly.time.length || hourly.temperature_2m[i] === null) {
                hSource = ecmwfData.hourly;
                // Find matching index in ECMWF by comparing timestamps
                const targetTime = hourly.time[i] || (new Date(now.getTime() + (i-currentHourIdx)*3600000)).toISOString().slice(0,16);
                idx = ecmwfData.hourly.time.indexOf(targetTime);
                if (idx === -1) idx = i; // Fallback to index if timestamp matching fails
            }
            
            if (idx >= hSource.time.length) break;
            
            const dateStr = hSource.time[idx];
            const temp = Math.round(convertTemp(hSource.temperature_2m[idx]));
            const hwCode = hSource.weather_code[idx];
            const hwInfo = weatherCodes[hwCode] || defaultWeather;
            const hwIcon = getWeatherIcon(hwCode, dateStr, daily);
            const isNow = i === currentHourIdx;

            const hourEl = document.createElement('div');
            
            if (isNow) {
                hourEl.className = 'min-w-[120px] bg-primary text-white p-stack-lg rounded-2xl flex flex-col items-center gap-stack-md shadow-lg scale-105';
                hourEl.innerHTML = `
                    <span class="font-label-caps opacity-70">NOW</span>
                    <span class="text-3xl leading-none my-1 drop-shadow-sm">${hwIcon}</span>
                    <span class="font-headline-md text-lg">${temp}°</span>
                `;
            } else {
                hourEl.className = 'min-w-[120px] bg-white border border-slate-100 p-stack-lg rounded-2xl flex flex-col items-center gap-stack-md';
                hourEl.innerHTML = `
                    <span class="font-label-caps text-slate-400">${formatHour(dateStr)}</span>
                    <span class="text-3xl leading-none my-1">${hwIcon}</span>
                    <span class="font-headline-md text-lg">${temp}°</span>
                `;
            }
            hourlyContainer.appendChild(hourEl);
        }
    }

    // --- Meteogram ---
    renderMeteogram(data);

    // --- 10-Day Forecast ---
    const tenDayContainer = document.getElementById('ten-day-forecast-container');
    if (tenDayContainer) {
        tenDayContainer.innerHTML = '';
        
        const ecmwfDaily = ecmwfData.daily;
        const totalDays = Math.min(ecmwfDaily.time.length, 10);
        
        for (let i = 0; i < totalDays; i++) {
            // Model Selection Logic for Daily Row
            let sourceDaily;
            if (currentModel === 'gem_seamless') sourceDaily = data.gemSeamlessData.daily;
            else if (currentModel === 'gem_global') sourceDaily = data.gemGlobalData.daily;
            else if (currentModel === 'gem_regional') sourceDaily = data.gemRegionalData.daily;
            else if (currentModel === 'gem_hrdps') sourceDaily = data.gemHrdpsData.daily;
            else if (currentModel === 'gem_hrdps_west') sourceDaily = data.gemHrdpsWestData.daily;
            else if (currentModel === 'ecmwf') sourceDaily = ecmwfDaily;
            else if (currentModel === 'ecmwf_aifs') sourceDaily = data.ecmwfAifsData.daily;
            else if (currentModel === 'gfs') sourceDaily = data.gfsData.daily;
            else if (currentModel === 'ncep_nbm') sourceDaily = data.nbmData.daily;
            else if (currentModel === 'graphcast') sourceDaily = data.graphcastData.daily;
            else if (currentModel === 'ai_gfs') sourceDaily = data.aiGfsData.daily;
            else if (currentModel === 'hgefs') sourceDaily = data.hgefsData.daily;
            else if (currentModel === 'hrrr') sourceDaily = data.hrrrData.daily;
            else if (currentModel === 'nam') sourceDaily = data.namData.daily;
            else {
                // Seamless
                sourceDaily = i < 3 ? daily : ecmwfDaily;
            }
            
            // Fallback for daily (like HRRR ending early)
            if (!sourceDaily.temperature_2m_max[i] && i < ecmwfDaily.temperature_2m_max.length) {
                sourceDaily = ecmwfDaily;
            }
            
            if (i >= sourceDaily.time.length) continue;

            const dateStr = sourceDaily.time[i];
            const maxTemp = sourceDaily.temperature_2m_max ? Math.round(convertTemp(sourceDaily.temperature_2m_max[i])) : '--';
            const minTemp = sourceDaily.temperature_2m_min ? Math.round(convertTemp(sourceDaily.temperature_2m_min[i])) : '--';
            const precipSum = sourceDaily.precipitation_sum ? (sourceDaily.precipitation_sum[i] || 0) : 0;
            const precipProb = sourceDaily.precipitation_probability_max ? (sourceDaily.precipitation_probability_max[i] || 0) : 0;
            const dCode = sourceDaily.weather_code[i];
            const dInfo = weatherCodes[dCode] || defaultWeather;
            const funCondition = funWeatherDescriptions[dCode] || dInfo.condition;
            
            const isToday = i === 0;
            const { day: shortDay, date: shortDate } = getShortDayDate(dateStr);

            // Night uses the next day's 2 AM weather code as an approximation
            let nightCode = dCode; // Fallback
            
            // Correct sourceHourly based on selection
            let sourceHourly = hourly;
            if (currentModel === 'gem_seamless') sourceHourly = data.gemSeamlessData.hourly;
            else if (currentModel === 'gem_global') sourceHourly = data.gemGlobalData.hourly;
            else if (currentModel === 'gem_regional') sourceHourly = data.gemRegionalData.hourly;
            else if (currentModel === 'gem_hrdps') sourceHourly = data.gemHrdpsData.hourly;
            else if (currentModel === 'gem_hrdps_west') sourceHourly = data.gemHrdpsWestData.hourly;
            else if (currentModel === 'ecmwf') sourceHourly = ecmwfData.hourly;
            else if (currentModel === 'ecmwf_aifs') sourceHourly = data.ecmwfAifsData.hourly;
            else if (currentModel === 'gfs') sourceHourly = data.gfsData.hourly;
            else if (currentModel === 'ncep_nbm') sourceHourly = data.nbmData.hourly;
            else if (currentModel === 'graphcast') sourceHourly = data.graphcastData.hourly;
            else if (currentModel === 'ai_gfs') sourceHourly = data.aiGfsData.hourly;
            else if (currentModel === 'hgefs') sourceHourly = data.hgefsData.hourly;
            else if (currentModel === 'hrrr') sourceHourly = data.hrrrData.hourly;
            else if (currentModel === 'nam') sourceHourly = data.namData.hourly;
            else {
                 sourceHourly = i < 3 ? data.gemSeamlessData.hourly : ecmwfData.hourly;
            }

            if (sourceHourly && sourceHourly.time) {
                const [y, m, d] = dateStr.split('-');
                const nextDay = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
                nextDay.setDate(nextDay.getDate() + 1);
                
                const ny = nextDay.getFullYear();
                const nm = String(nextDay.getMonth() + 1).padStart(2, '0');
                const nd = String(nextDay.getDate()).padStart(2, '0');
                const targetTime = `${ny}-${nm}-${nd}T02:00`;
                
                const hourlyIndex = sourceHourly.time.indexOf(targetTime);
                if (hourlyIndex !== -1 && sourceHourly.weather_code[hourlyIndex] !== undefined) {
                    nightCode = sourceHourly.weather_code[hourlyIndex];
                }
            }
            const funNightCondition = funWeatherDescriptions[nightCode] || (weatherCodes[nightCode] ? weatherCodes[nightCode].condition : 'Starry night');

            const rowEl = document.createElement('div');
            const borderClass = i < totalDays - 1 ? 'border-b border-slate-100' : '';
            rowEl.className = `flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 md:py-4 ${borderClass} hover:bg-slate-50 transition-colors cursor-pointer group`;
            
            // Precipitation display
            const precipDisplay = precipProb > 0
                ? `<span class="flex items-center gap-1 text-[#4b9fd5] text-sm font-semibold whitespace-nowrap"><svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><path d="M6 0 C6 0 0 7 0 9.5 a6 6 0 0 0 12 0 C12 7 6 0 6 0z"/></svg>${precipProb}%</span>`
                : `<span class="text-sm text-slate-300 font-semibold">0%</span>`;

            rowEl.innerHTML = `
                <!-- Top Row: Day, Icon, Temps, Precip -->
                <div class="flex items-center gap-3 w-full">
                    <div class="flex flex-col items-start w-14 shrink-0">
                        <span class="text-sm font-bold text-slate-800 leading-tight">${isToday ? 'TODAY' : shortDay}</span>
                        <span class="text-xs text-slate-400 font-medium">${shortDate}</span>
                    </div>
                    <span class="text-3xl md:text-4xl leading-none drop-shadow-sm shrink-0">${dInfo.icon}</span>
                    <div class="flex items-baseline gap-1.5 shrink-0">
                        <span class="text-lg md:text-xl font-bold text-slate-800">${maxTemp}°</span>
                        <span class="text-sm font-semibold text-slate-400">${minTemp}°</span>
                    </div>
                    <div class="flex flex-col flex-1 min-w-0 hidden md:flex">
                        <span class="text-sm font-semibold text-slate-700 break-words">${funCondition}</span>
                        <span class="flex items-center gap-1 text-xs text-slate-400 mt-0.5"><span>🌙</span> <span class="break-words">Night: ${funNightCondition}</span></span>
                    </div>
                    <div class="shrink-0 w-12 text-right ml-auto">
                        ${precipDisplay}
                    </div>
                </div>
                <!-- Mobile-only: Condition text below -->
                <div class="flex flex-col w-full pl-[68px] -mt-1 md:hidden">
                    <span class="text-xs font-semibold text-slate-600">${funCondition}</span>
                    <span class="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5"><span>🌙</span> Night: ${funNightCondition}</span>
                </div>
            `;
            tenDayContainer.appendChild(rowEl);
        }
    }

    // --- Wind Details ---
    const windSpeedEl = document.getElementById('detail-wind-speed');
    if (windSpeedEl) {
        const windSpeed = Math.round(current.wind_speed_10m);
        const windGusts = Math.round(current.wind_gusts_10m || windSpeed);
        const windDir = current.wind_direction_10m;
        const windDirStr = getWindDirectionStr(windDir);

        windSpeedEl.textContent = windSpeed;
        document.getElementById('detail-wind-desc').textContent = `${windDirStr} Gusts`;
        
        document.getElementById('detail-wind-icon').style.transform = `rotate(${windDir}deg)`;
        document.getElementById('detail-wind-dir-label').textContent = windDirStr;
        
        document.getElementById('detail-wind-gusts').textContent = `${windGusts} km/h`;
        document.getElementById('detail-wind-direction').textContent = `${windDir}° ${windDirStr}`;
    }
}

// Main Flow
async function initializeDashboard() {
    try {
        errorMessage.classList.add('hidden');
        if(weatherMain) weatherMain.classList.add('hidden');
        loadingSpinner.classList.remove('hidden');

        const data = await getWeather();
        weatherDataCache = data;
        updateWeatherCard(data);

        loadingSpinner.classList.add('hidden');
        if(weatherMain) weatherMain.classList.remove('hidden');
    } catch (err) {
        console.error(err);
        loadingSpinner.classList.add('hidden');
        errorMessage.classList.remove('hidden');
    }
}

// Load on startup
document.addEventListener('DOMContentLoaded', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLat = position.coords.latitude;
                userLon = position.coords.longitude;
            },
            (error) => {
                console.log("Geolocation error/denied, falling back to current location for proximity sorting.");
            }
        );
    }

    document.getElementById('btn-celsius')?.addEventListener('click', () => setUnit('C'));
    document.getElementById('btn-fahrenheit')?.addEventListener('click', () => setUnit('F'));
    
    setupCustomDropdown();

    document.getElementById('btn-full-24h')?.addEventListener('click', () => {
        displayHourlyCount = 24;
        if (weatherDataCache) {
            updateWeatherCard(weatherDataCache);
            const container = document.getElementById('hourly-forecast-container');
            if (container) {
                setTimeout(() => {
                    container.scrollBy({ left: 300, behavior: 'smooth' });
                }, 50);
            }
        }
    });

    document.getElementById('btn-radar-precip')?.addEventListener('click', function() {
        const iframe = document.getElementById('radar-iframe');
        if(iframe) {
            iframe.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=8&overlay=radar&product=radar&level=surface&lat=${currentLat}&lon=${currentLon}`;
        }
        this.className = "px-4 py-2 bg-surface-container rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors";
        const btnWind = document.getElementById('btn-radar-wind');
        if(btnWind) btnWind.className = "px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-slate-50 transition-colors";
    });

    document.getElementById('btn-radar-wind')?.addEventListener('click', function() {
        const iframe = document.getElementById('radar-iframe');
        if(iframe) {
            iframe.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=8&overlay=wind&product=radar&level=surface&lat=${currentLat}&lon=${currentLon}`;
        }
        this.className = "px-4 py-2 bg-surface-container rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors";
        const btnPrecip = document.getElementById('btn-radar-precip');
        if(btnPrecip) btnPrecip.className = "px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-slate-50 transition-colors";
    });
    
    const searchInput = document.getElementById('city-search-input');
    const dropdown = document.getElementById('search-results-dropdown');

    searchInput?.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (searchTimeout) clearTimeout(searchTimeout);
        if (val.length < 2) {
            if(dropdown) dropdown.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => {
            fetchCitySuggestions(val);
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (searchInput && dropdown && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    document.getElementById('city-search-btn')?.addEventListener('click', () => {
        if (searchInput && searchInput.value) {
            searchCity(searchInput.value);
            if(dropdown) dropdown.classList.add('hidden');
        }
    });
    
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchCity(e.target.value);
            if(dropdown) dropdown.classList.add('hidden');
        }
    });

    initializeDashboard();
});

async function fetchCitySuggestions(query) {
    try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=en&format=json`;
        const res = await fetch(geoUrl);
        const data = await res.json();
        
        const dropdown = document.getElementById('search-results-dropdown');
        if(!dropdown) return;
        dropdown.innerHTML = '';
        
        if (data.results && data.results.length > 0) {
            const refLat = userLat !== null ? userLat : currentLat;
            const refLon = userLon !== null ? userLon : currentLon;
            
            data.results.sort((a, b) => {
                const distA = getDistance(refLat, refLon, a.latitude, a.longitude);
                const distB = getDistance(refLat, refLon, b.latitude, b.longitude);
                return distA - distB;
            });

            const topResults = data.results.slice(0, 5);

            topResults.forEach(city => {
                const item = document.createElement('div');
                item.className = 'px-3 py-2 hover:bg-surface-container cursor-pointer flex items-center justify-between border-b border-slate-50 last:border-0';
                
                let flagHtml = '';
                if (city.country_code) {
                    const cc = city.country_code.toLowerCase();
                    flagHtml = `<img src="https://flagcdn.com/w20/${cc}.png" srcset="https://flagcdn.com/w40/${cc}.png 2x" alt="${city.country || cc}" class="h-4 w-auto rounded-sm">`;
                }
                
                let details = city.country || '';
                if (city.admin1 && city.admin1 !== city.name) {
                    details = `${city.admin1}, ${details}`;
                }
                
                item.innerHTML = `
                    <div class="flex flex-col text-left overflow-hidden">
                        <span class="text-sm font-bold text-on-surface truncate">${city.name}</span>
                        <span class="text-[10px] text-on-surface-variant leading-tight truncate">${details}</span>
                    </div>
                    <span class="ml-3 shrink-0 flex items-center" title="${city.country || ''}">${flagHtml}</span>
                `;
                
                item.addEventListener('click', () => {
                    selectCity(city);
                    dropdown.classList.add('hidden');
                    const input = document.getElementById('city-search-input');
                    if(input) input.value = city.name;
                });
                
                dropdown.appendChild(item);
            });
            dropdown.classList.remove('hidden');
        } else {
            dropdown.innerHTML = '<div class="px-3 py-2 text-sm text-slate-500 text-center">No results found</div>';
            dropdown.classList.remove('hidden');
        }
    } catch(err) {
        console.error("Error fetching suggestions:", err);
    }
}

async function selectCity(city) {
    currentLat = city.latitude;
    currentLon = city.longitude;
    currentElevation = city.elevation || 10;
    currentCityName = city.name;
    
    const stationIdEl = document.getElementById('station-id-display');
    if (stationIdEl && city.id) {
        stationIdEl.textContent = `Station ID: GEO-${city.id}`;
    }
    
    const cityNameEl = document.getElementById('city-name-header');
    if (cityNameEl) {
        let flagHtml = '';
        if (city.country_code) {
            const cc = city.country_code.toLowerCase();
            flagHtml = `<img src="https://flagcdn.com/w40/${cc}.png" srcset="https://flagcdn.com/w80/${cc}.png 2x" alt="${city.country || cc}" class="inline-block h-6 w-auto rounded-sm shadow-sm">`;
        }
        cityNameEl.innerHTML = `${city.name} <span id="city-flag-header" class="flex items-center" title="${city.country || ''}">${flagHtml}</span>`;
    }
    
    // Update mobile city name
    const cityNameMobileEl = document.getElementById('city-name-header-mobile');
    if (cityNameMobileEl) {
        let flagHtml = '';
        if (city.country_code) {
            const cc = city.country_code.toLowerCase();
            flagHtml = `<img src="https://flagcdn.com/w40/${cc}.png" srcset="https://flagcdn.com/w80/${cc}.png 2x" alt="${city.country || cc}" class="inline-block h-5 w-auto rounded-sm shadow-sm">`;
        }
        cityNameMobileEl.innerHTML = `${city.name} <span id="city-flag-header-mobile" class="flex items-center" title="${city.country || ''}">${flagHtml}</span>`;
    }
    
    // update radar map URL
    const iframe = document.getElementById('radar-iframe');
    if(iframe) {
        const src = iframe.src;
        const newSrc = src.replace(/lat=[-\d.]+/, `lat=${currentLat}`).replace(/lon=[-\d.]+/, `lon=${currentLon}`);
        iframe.src = newSrc;
    }
    
    await initializeDashboard();
    
    // Clear input
    const input = document.getElementById('city-search-input');
    if (input) input.value = '';
}

async function searchCity(cityName) {
    if (!cityName) return;
    try {
        loadingSpinner.classList.remove('hidden');
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=20&language=en&format=json`;
        const res = await fetch(geoUrl);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const refLat = userLat !== null ? userLat : currentLat;
            const refLon = userLon !== null ? userLon : currentLon;
            data.results.sort((a, b) => {
                const distA = getDistance(refLat, refLon, a.latitude, a.longitude);
                const distB = getDistance(refLat, refLon, b.latitude, b.longitude);
                return distA - distB;
            });
            const city = data.results[0];
            await selectCity(city);
        } else {
            alert("City not found.");
            loadingSpinner.classList.add('hidden');
        }
    } catch(err) {
        console.error(err);
        alert("Error searching city.");
        loadingSpinner.classList.add('hidden');
    }
}
function setupCustomDropdown() {
    const wrapper = document.getElementById('model-select-wrapper');
    const trigger = document.getElementById('model-select-trigger');
    const label = document.getElementById('model-select-label');
    const options = document.querySelectorAll('.custom-option');
    const globalTooltip = document.getElementById('model-tooltip-global');

    if (!wrapper || !trigger || !label || !globalTooltip) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });

    options.forEach(option => {
        // Tooltip hover logic
        option.addEventListener('mouseenter', () => {
            const description = option.getAttribute('data-description');
            if (description && window.innerWidth > 768) {
                globalTooltip.textContent = description;
                const rect = option.getBoundingClientRect();
                
                // Position tooltip to the left of the option
                globalTooltip.style.top = `${rect.top + rect.height / 2}px`;
                globalTooltip.style.left = `${rect.left - 20}px`;
                globalTooltip.style.transform = `translate(-100%, -50%)`;
                
                globalTooltip.classList.add('visible');
            }
        });

        option.addEventListener('mouseleave', () => {
            globalTooltip.classList.remove('visible');
        });

        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = option.getAttribute('data-value');
            const text = option.querySelector('span').textContent;
            
            currentModel = value;
            label.textContent = text;
            
            // Update selected class
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            
            wrapper.classList.remove('open');
            globalTooltip.classList.remove('visible');
            
            if (weatherDataCache) {
                updateWeatherCard(weatherDataCache);
            }
        });
    });

    // Close on click outside
    document.addEventListener('click', () => {
        wrapper.classList.remove('open');
        globalTooltip.classList.remove('visible');
    });

    // Hide tooltip on scroll
    document.querySelector('.custom-select-options')?.addEventListener('scroll', () => {
        globalTooltip.classList.remove('visible');
    });
}
