from django.contrib import admin
from .models import PhoneNumber, UserApp


class PhoneNumbersAdmin(admin.ModelAdmin):
    pass


class UserAppAdmin(admin.ModelAdmin):
    pass


admin.site.register(PhoneNumber, PhoneNumbersAdmin)
admin.site.register(UserApp, UserAppAdmin)
