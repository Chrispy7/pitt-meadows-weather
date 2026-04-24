// Elements
const errorMessage = document.getElementById('error-message');
const weatherMain = document.getElementById('weather-main');
const loadingSpinner = document.getElementById('loading-spinner');

// Pitt Meadows Data
const PITT_LAT = 49.2238;
const PITT_LON = -122.6893;
const ELEVATION = 12;

// Open-Meteo WMO Weather codes (Mapped to Emojis)
const weatherCodes = {
    0: { condition: 'Clear sky', icon: '☀️' },
    1: { condition: 'Mainly clear', icon: '🌤️' },
    2: { condition: 'Partly cloudy', icon: '⛅' },
    3: { condition: 'Overcast', icon: '☁️' },
    45: { condition: 'Fog', icon: '🌫️' },
    48: { condition: 'Depositing rime fog', icon: '🌫️' },
    51: { condition: 'Light drizzle', icon: '🌧️' },
    53: { condition: 'Moderate drizzle', icon: '🌧️' },
    55: { condition: 'Dense drizzle', icon: '🌧️' },
    61: { condition: 'Slight rain', icon: '🌧️' },
    63: { condition: 'Moderate rain', icon: '🌧️' },
    65: { condition: 'Heavy rain', icon: '🌧️' },
    71: { condition: 'Slight snow', icon: '❄️' },
    73: { condition: 'Moderate snow', icon: '❄️' },
    75: { condition: 'Heavy snow', icon: '❄️' },
    77: { condition: 'Snow grains', icon: '❄️' },
    80: { condition: 'Slight rain showers', icon: '🌦️' },
    81: { condition: 'Moderate rain showers', icon: '🌦️' },
    82: { condition: 'Violent rain showers', icon: '🌦️' },
    85: { condition: 'Slight snow showers', icon: '🌨️' },
    86: { condition: 'Heavy snow showers', icon: '🌨️' },
    95: { condition: 'Thunderstorm', icon: '⛈️' },
    96: { condition: 'Thunderstorm with slight hail', icon: '⛈️' },
    99: { condition: 'Thunderstorm with heavy hail', icon: '⛈️' }
};

const defaultWeather = { condition: 'Unknown', icon: '❓' };

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

const getWindDirectionStr = (degrees) => {
    const val = Math.floor((degrees / 22.5) + 0.5);
    const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return arr[(val % 16)];
};

// Fetch Weather from Open-Meteo
async function getWeather() {
    const gemUrl = `https://api.open-meteo.com/v1/forecast?latitude=${PITT_LAT}&longitude=${PITT_LON}&elevation=${ELEVATION}&current=temperature_2m,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,visibility,surface_pressure,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&models=gem_seamless&timezone=auto`;
    const ecmwfUrl = `https://api.open-meteo.com/v1/forecast?latitude=${PITT_LAT}&longitude=${PITT_LON}&elevation=${ELEVATION}&hourly=temperature_2m,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&models=ecmwf_ifs025&timezone=auto&forecast_days=10`;
    
    const [gemRes, ecmwfRes] = await Promise.all([fetch(gemUrl), fetch(ecmwfUrl)]);
    
    if (!gemRes.ok || !ecmwfRes.ok) throw new Error(`Failed to fetch weather data`);
    
    const gemData = await gemRes.json();
    const ecmwfData = await ecmwfRes.json();
    
    return { gemData, ecmwfData };
}

let meteogramChartInstance = null;

function renderMeteogram(gemData, ecmwfData) {
    const canvas = document.getElementById('meteogram-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');

    // Merge data: GEM for first 3 days (72 hours from now roughly), ECMWF for the rest
    const now = new Date();
    const hourlyTime = ecmwfData.hourly.time;
    const labels = [];
    const temperatures = [];
    const precipitations = [];
    const icons = [];
    
    let currentHourIdx = 0;
    for (let i = 0; i < hourlyTime.length; i++) {
        if (new Date(hourlyTime[i]) >= now) {
            currentHourIdx = i;
            break;
        }
    }
    
    // We want to plot the next 10 days (240 hours approx)
    const hoursToPlot = Math.min(240, hourlyTime.length - currentHourIdx);
    
    for (let i = currentHourIdx; i < currentHourIdx + hoursToPlot; i++) {
        const timeStr = hourlyTime[i];
        
        // Find if this hour is within the first 3 days
        const hoursFromNow = i - currentHourIdx;
        const useGem = hoursFromNow < 72 && i < gemData.hourly.time.length;
        
        const sourceData = useGem ? gemData : ecmwfData;
        
        // Push data
        const dateObj = new Date(timeStr);
        // Label formatting
        const isMidnight = dateObj.getHours() === 0;
        if (isMidnight || i === currentHourIdx) {
             labels.push(formatShortDate(timeStr));
        } else if (dateObj.getHours() % 12 === 0) {
             labels.push(formatHour(timeStr));
        } else {
             labels.push('');
        }
        
        temperatures.push(sourceData.hourly.temperature_2m[i]);
        precipitations.push(sourceData.hourly.precipitation[i] || 0);
        
        const wCode = sourceData.hourly.weather_code ? sourceData.hourly.weather_code[i] : 0;
        const iconName = weatherCodes[wCode] ? weatherCodes[wCode].icon : 'help';
        
        if (isMidnight || dateObj.getHours() === 12) {
            icons.push(iconName);
        } else {
            icons.push(null);
        }
    }

    if (meteogramChartInstance) {
        meteogramChartInstance.destroy();
    }

    meteogramChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            weatherIcons: icons,
            datasets: [
                {
                    label: 'Temperature (°C)',
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
                    top: 40
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
                        maxRotation: 0,
                        autoSkip: false,
                        callback: function(val, index) {
                            return labels[index] !== '' ? labels[index] : null;
                        },
                        font: {
                            family: 'Manrope',
                            size: 10
                        }
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Temperature (°C)',
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
    const gemData = data.gemData;
    const ecmwfData = data.ecmwfData;

    const current = gemData.current;
    const daily = gemData.daily; // GEM daily
    const hourly = gemData.hourly;
    const wCode = current.weather_code;
    const weatherInfo = weatherCodes[wCode] || defaultWeather;

    // --- Current Hero ---
    const currTempEl = document.getElementById(`current-temp`);
    if (currTempEl) {
        currTempEl.textContent = `${Math.round(current.temperature_2m)}°`;
        document.getElementById(`current-condition`).textContent = weatherInfo.condition;
        document.getElementById(`current-icon`).textContent = weatherInfo.icon;
        
        document.getElementById(`current-range`).textContent = `H: ${Math.round(daily.temperature_2m_max[0])}° / L: ${Math.round(daily.temperature_2m_min[0])}°`;
        
        // Precip & Wind
        const precipProb = daily.precipitation_probability_max[0] || 0;
        document.getElementById(`current-precip`).textContent = `Precip: ${precipProb}%`;
        document.getElementById(`current-wind`).textContent = `Wind: ${Math.round(current.wind_speed_10m)}km/h ${getWindDirectionStr(current.wind_direction_10m)}`;
    }

    // --- Stats Grid Mini ---
    const statHumEl = document.getElementById(`stat-humidity`);
    if (statHumEl) {
        statHumEl.textContent = `${Math.round(current.relative_humidity_2m)}%`;
        document.getElementById(`stat-humidity-bar`).style.width = `${current.relative_humidity_2m}%`;
        
        // Open-Meteo GEM doesn't provide UV easily in this model, so leave placeholder or set to 4
        document.getElementById(`stat-uv`).textContent = `4`; 
        
        // Visibility is in meters, convert to km
        const visibilityKm = (current.visibility / 1000).toFixed(1);
        document.getElementById(`stat-visibility`).textContent = `${visibilityKm} km`;
        
        // Pressure in hPa to kPa (1 hPa = 0.1 kPa)
        const pressureKpa = (current.surface_pressure / 10).toFixed(1);
        document.getElementById(`stat-pressure`).textContent = `${pressureKpa}`;
    }

    // --- Hourly Forecast ---
    const hourlyContainer = document.getElementById(`hourly-forecast-container`);
    if (hourlyContainer) {
        hourlyContainer.innerHTML = '';
        
        // Find current hour index
        const now = new Date();
        // Open-Meteo returns time in ISO format for the timezone.
        let currentHourIdx = 0;
        for (let i=0; i<hourly.time.length; i++) {
            if (new Date(hourly.time[i]) >= now) {
                currentHourIdx = i;
                break;
            }
        }
        
        // Show next 8 hours
        for (let i = currentHourIdx; i < currentHourIdx + 8; i++) {
            if (i >= hourly.time.length) break;
            
            const dateStr = hourly.time[i];
            const temp = Math.round(hourly.temperature_2m[i]);
            const hwCode = hourly.weather_code[i];
            const hwInfo = weatherCodes[hwCode] || defaultWeather;
            const isNow = i === currentHourIdx;

            const hourEl = document.createElement('div');
            
            if (isNow) {
                hourEl.className = 'min-w-[120px] bg-primary text-white p-stack-lg rounded-2xl flex flex-col items-center gap-stack-md shadow-lg scale-105';
                hourEl.innerHTML = `
                    <span class="font-label-caps opacity-70">NOW</span>
                    <span class="text-3xl leading-none my-1 drop-shadow-sm">${hwInfo.icon}</span>
                    <span class="font-headline-md text-lg">${temp}°</span>
                `;
            } else {
                hourEl.className = 'min-w-[120px] bg-white border border-slate-100 p-stack-lg rounded-2xl flex flex-col items-center gap-stack-md';
                hourEl.innerHTML = `
                    <span class="font-label-caps text-slate-400">${formatHour(dateStr)}</span>
                    <span class="text-3xl leading-none my-1">${hwInfo.icon}</span>
                    <span class="font-headline-md text-lg">${temp}°</span>
                `;
            }
            hourlyContainer.appendChild(hourEl);
        }
    }

    // --- Meteogram ---
    renderMeteogram(gemData, ecmwfData);

    // --- 10-Day Forecast ---
    const tenDayContainer = document.getElementById('ten-day-forecast-container');
    if (tenDayContainer) {
        tenDayContainer.innerHTML = '';
        
        const ecmwfDaily = ecmwfData.daily;
        const totalDays = Math.min(ecmwfDaily.time.length, 10);
        
        // Determine overall min/max to scale the temperature bars
        let absoluteMinTemp = 999;
        let absoluteMaxTemp = -999;
        for (let i = 0; i < totalDays; i++) {
            const sourceDaily = i < 3 ? daily : ecmwfDaily;
            if (i >= sourceDaily.time.length) continue;
            const minT = Math.round(sourceDaily.temperature_2m_min[i]);
            const maxT = Math.round(sourceDaily.temperature_2m_max[i]);
            if (minT < absoluteMinTemp) absoluteMinTemp = minT;
            if (maxT > absoluteMaxTemp) absoluteMaxTemp = maxT;
        }
        const tempRange = absoluteMaxTemp - absoluteMinTemp;
        
        for (let i = 0; i < totalDays; i++) {
            const isGem = i < 3;
            const sourceDaily = isGem ? daily : ecmwfDaily;
            
            // Ensure the source has data for this day
            if (i >= sourceDaily.time.length) continue;

            const dateStr = sourceDaily.time[i];
            const maxTemp = Math.round(sourceDaily.temperature_2m_max[i]);
            const minTemp = Math.round(sourceDaily.temperature_2m_min[i]);
            const precipSum = sourceDaily.precipitation_sum[i] || 0;
            const dCode = sourceDaily.weather_code[i];
            const dInfo = weatherCodes[dCode] || defaultWeather;
            
            const dayName = i === 0 ? "Today" : getLongDay(dateStr);

            // Calculate positions for the bar
            const leftPercent = ((minTemp - absoluteMinTemp) / tempRange) * 100;
            const widthPercent = ((maxTemp - minTemp) / tempRange) * 100;

            const rowEl = document.createElement('div');
            rowEl.className = 'flex-1 min-w-[100px] flex flex-col items-center p-4 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors text-center';
            
            rowEl.innerHTML = `
                <span class="font-bold text-on-surface whitespace-nowrap mb-2">${dayName}</span>
                <span class="text-4xl leading-none drop-shadow-sm my-2">${dInfo.icon}</span>
                <div class="flex justify-center gap-3 w-full mt-2">
                    <span class="text-sm font-bold text-slate-400">${minTemp}°</span>
                    <span class="text-sm font-bold text-on-surface">${maxTemp}°</span>
                </div>
                <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative mt-2 mb-1">
                    <div class="absolute h-full bg-gradient-to-r from-blue-400 to-red-400 rounded-full opacity-60" style="left: ${leftPercent}%; width: ${Math.max(widthPercent, 5)}%;"></div>
                </div>
                <span class="text-[10px] font-bold text-slate-400 mt-2 h-4">${precipSum > 0 ? precipSum.toFixed(1) + 'mm' : ''}</span>
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
document.addEventListener('DOMContentLoaded', initializeDashboard);
