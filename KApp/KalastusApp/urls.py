from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),  # Admin-osoite
    path('fishing/', include('fishing.urls')),  # Root-osoite, jos haluat näyttää sovelluksen juuren
]






