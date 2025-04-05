import requests
import os
from dotenv import load_dotenv

# Lataa ympäristömuuttujat .env-tiedostosta
load_dotenv()

# OpenWeather API avain ja URL
api_key = os.getenv("OPENWEATHER_API_KEY")
base_url = "http://api.openweathermap.org/data/2.5/weather?"

def get_weather(city):
    """Hakee säätiedot annetulle kaupungille OpenWeather API:sta"""
    if not api_key:
        raise ValueError("API-avain puuttuu. Lisää .env-tiedostoon OPENWEATHER_API_KEY.")

    complete_url = f"{base_url}q={city}&appid={api_key}&units=metric"
    
    response = requests.get(complete_url)
    data = response.json()

    if data.get("cod") != 200:
        return {"error": "Kaupunki ei löydy tai API-kutsu epäonnistui!"}

    return {
        "temperature": data["main"]["temp"],
        "pressure": data["main"]["pressure"],
        "humidity": data["main"]["humidity"],
        "wind_speed": data["wind"]["speed"],
        "city": city
    }

if __name__ == "__main__":
    # Testikutsu
    city = "Helsinki"
    weather = get_weather(city)
    print(weather)
