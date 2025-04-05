from django.db import models
from django.contrib.auth.models import User

class FishingSpot(models.Model):
    name = models.CharField(max_length=200)
    location = models.CharField(max_length=255)
    description = models.TextField()
    latitude = models.FloatField()
    longitude = models.FloatField()

    def __str__(self):
        return self.name

class FishingRecord(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    fishing_spot = models.ForeignKey(FishingSpot, on_delete=models.CASCADE)
    fish_type = models.CharField(max_length=100)
    weight = models.FloatField()
    length = models.FloatField()
    fishing_time = models.DateTimeField()

    def __str__(self):
        return f"{self.user} - {self.fish_type} - {self.fishing_spot.name}"

class MoonPhase(models.Model):
    name = models.CharField(max_length=50)
    date = models.DateField()

    def __str__(self):
        return f"{self.name} ({self.date})"

class WeatherCondition(models.Model):
    fishing_record = models.OneToOneField(FishingRecord, on_delete=models.CASCADE)
    wind_direction = models.CharField(max_length=50)
    air_pressure = models.FloatField()
    temperature = models.FloatField()
    humidity = models.FloatField()

    def __str__(self):
        return f"Weather at {self.fishing_record.fishing_spot.name} - {self.wind_direction}"

class UserFavoriteSpot(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    fishing_spot = models.ForeignKey(FishingSpot, on_delete=models.CASCADE)
    favorite_reason = models.TextField()

    def __str__(self):
        return f"{self.user}'s favorite spot: {self.fishing_spot.name}"

class FishingLog(models.Model):
    date = models.DateField()
    location = models.CharField(max_length=255)

    def __str__(self):
        return f"FishingLog on {self.date} at {self.location}"
