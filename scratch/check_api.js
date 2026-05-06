
const lat = 49.22;
const lon = -122.69;
const models = "gem_seamless,ecmwf_ifs,ecmwf_aifs025,ecmwf_aifs";
const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&models=${models}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log("Keys in hourly:", Object.keys(data.hourly));
    if (data.hourly.temperature_2m_ecmwf_aifs025) {
        console.log("ecmwf_aifs025 has data. Length:", data.hourly.temperature_2m_ecmwf_aifs025.filter(x => x !== null).length);
    } else {
        console.log("ecmwf_aifs025 NOT found");
    }
    if (data.hourly.temperature_2m_ecmwf_aifs) {
        console.log("ecmwf_aifs has data. Length:", data.hourly.temperature_2m_ecmwf_aifs.filter(x => x !== null).length);
    } else {
        console.log("ecmwf_aifs NOT found");
    }
  })
  .catch(err => console.error(err));
