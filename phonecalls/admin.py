from django.contrib import admin

from .models import PhoneNumbers


class PhoneNumbersAdmin(admin.ModelAdmin):
    pass

admin.site.register(PhoneNumbers, PhoneNumbersAdmin)
