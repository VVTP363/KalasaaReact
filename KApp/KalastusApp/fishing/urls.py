from django.urls import path
from .views import get_weather, get_weather_forecast

urlpatterns = [
    path('weather/<str:location>/', get_weather, name='weather'),
    path('forecast/<str:location>/', get_weather_forecast, name='weather-forecast'),
]