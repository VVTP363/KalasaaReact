from django.contrib import admin
from .models import FishingSpot, FishingRecord, MoonPhase, WeatherCondition, UserFavoriteSpot, FishingLog

admin.site.register(FishingSpot)
admin.site.register(FishingRecord)
admin.site.register(MoonPhase)
admin.site.register(WeatherCondition)
admin.site.register(UserFavoriteSpot)
admin.site.register(FishingLog)
