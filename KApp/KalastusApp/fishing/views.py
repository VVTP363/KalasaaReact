import requests
from django.http import JsonResponse
from datetime import datetime

# OpenWeather API-avain
OPENWEATHER_API_KEY = "cb70d74e994ef590ee5841b6ad634143"

def get_weather(request, location):
    """ Hakee säätiedot paikannimellä tai koordinaateilla """
    try:
        if "," in location:
            lat, lon = location.split(",")
            api_url = f"http://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric&lang=fi"
        else:
            api_url = f"http://api.openweathermap.org/data/2.5/weather?q={location}&appid={OPENWEATHER_API_KEY}&units=metric&lang=fi"

        response = requests.get(api_url)
        weather_data = response.json()

        # Tarkistetaan, onko haettu kaupunki olemassa
        if "cod" in weather_data and weather_data["cod"] != 200:
            return JsonResponse({"error": "Säädatan haku epäonnistui", "details": weather_data.get("message", "Tuntematon virhe")}, status=404)

        data = {
            "kaupunki": weather_data.get("name", "Tuntematon"),
            "koordinaatit": {
                "lon": weather_data["coord"]["lon"],
                "lat": weather_data["coord"]["lat"]
            },
            "lämpötila": weather_data["main"]["temp"],
            "tuntuu_kuin": weather_data["main"]["feels_like"],
            "ilmanpaine": weather_data["main"]["pressure"],
            "kosteus": weather_data["main"]["humidity"],
            "tuuli_nopeus": weather_data["wind"]["speed"],
            "tuuli_suunta": weather_data["wind"]["deg"],
            "sää": weather_data["weather"][0]["description"]
        }

        return JsonResponse(data, json_dumps_params={'ensure_ascii': False})

    except Exception as e:
        return JsonResponse({"error": "Säädatan haku epäonnistui", "details": str(e)}, status=500)

def get_weather_forecast(request, location):
    """ Hakee 7 päivän sääennusteen paikannimellä tai koordinaateilla """
    try:
        if "," in location:
            lat, lon = location.split(",")
            api_url = f"http://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&cnt=7&appid={OPENWEATHER_API_KEY}&units=metric&lang=fi"
        else:
            api_url = f"http://api.openweathermap.org/data/2.5/forecast?q={location}&cnt=7&appid={OPENWEATHER_API_KEY}&units=metric&lang=fi"

        response = requests.get(api_url)
        data = response.json()

        # Debug-tulostukset virheiden selvittämiseksi
        print("✅ OpenWeather API vastaus:", data)

        # Tarkistetaan, onko haettu kaupunki olemassa
        if "cod" in data and data["cod"] != "200":
            return JsonResponse({"error": "Sääennustetta ei löytynyt", "details": data.get("message", "Tuntematon virhe")}, status=404)

        if "list" not in data:
            return JsonResponse({"error": "Sääennustetta ei löytynyt"}, status=404)

        forecast = []
        for day in data["list"]:
            # Tarkistetaan, että "main" ja "weather" -tiedot löytyvät
            if "main" in day and "weather" in day and len(day["weather"]) > 0:
                forecast.append({
                    "päivämäärä": datetime.utcfromtimestamp(day["dt"]).strftime('%Y-%m-%d'),
                    "lämpötila": day["main"]["temp"],
                    "sää": day["weather"][0]["description"]
                })
            else:
                print(f"⚠ Skippaan päivän {day} koska tietoja puuttuu.")

        return JsonResponse({"kaupunki": location, "ennuste": forecast}, json_dumps_params={'ensure_ascii': False})

    except Exception as e:
        print("❌ Virhe haettaessa sääennustetta:", str(e))
        return JsonResponse({"error": "Sääennusteen haku epäonnistui", "details": str(e)}, status=500)




